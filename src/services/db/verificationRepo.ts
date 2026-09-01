import { isChallengeCardType } from "../../models/card";
import { supabase } from "../../lib/supabase";
import { newUuid } from "../../lib/ids";
import * as cardRepo from "./cardRepo";
import {
  addGameEvent,
  applyPointDeltas,
  channelTopic,
  isChallengeVerificationDeputyColumnError,
  nowIso,
  playerCardsId,
} from "./shared";

export async function cancelPendingChallengeVerificationsForPlayerHole(
  gameId: string,
  claimantId: string,
  hole: number,
): Promise<void> {
  const { data: rows } = await supabase
    .from("challenge_verifications")
    .select("*")
    .eq("game_id", gameId)
    .eq("claimant_id", claimantId)
    .eq("status", "pending");
  for (const row of rows ?? []) {
    if (Number(row.hole) !== hole) continue;
    await supabase
      .from("challenge_verifications")
      .update({ status: "cancelled", cancelled_at: nowIso() })
      .eq("id", row.id as string);
  }
}

export function subscribeChallengeVerifications(
  gameId: string,
  onNext: (rows: Record<string, unknown>[]) => void,
): () => void {
  const gid = gameId.trim();
  if (!gid) {
    onNext([]);
    return () => {};
  }

  const load = async () => {
    const { data, error } = await supabase
      .from("challenge_verifications")
      .select("*")
      .eq("game_id", gid)
      .order("created_at", { ascending: false })
      .limit(40);
    if (error && __DEV__) {
      console.warn("[subscribeChallengeVerifications]", error.message);
    }
    onNext(data ?? []);
  };
  void load();

  const ch = supabase
    .channel(channelTopic(`cv-${gid}`))
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "challenge_verifications",
        filter: `game_id=eq.${gid}`,
      },
      () => void load(),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(ch);
  };
}

/** Cheap count for tab badge: pending rows **you can resolve** (not your own request). */
export async function fetchPendingChallengeVerificationCount(
  gameId: string,
  viewerPlayerId: string,
): Promise<number> {
  const gid = gameId.trim();
  const vid = viewerPlayerId.trim();
  if (!gid) {
    return 0;
  }
  if (!vid) {
    return 0;
  }
  const { count, error } = await supabase
    .from("challenge_verifications")
    .select("*", { count: "exact", head: true })
    .eq("game_id", gid)
    .eq("status", "pending")
    .neq("claimant_id", vid);
  if (error) {
    if (__DEV__) {
      console.warn("[fetchPendingChallengeVerificationCount]", error.message);
    }
    return 0;
  }
  return Math.max(0, count ?? 0);
}

export async function requestChallengeVerification(input: {
  gameId: string;
  claimantId: string;
  claimantName: string;
  cardId: string;
  cardHole: number;
  pointsToAward: number;
  cardSummary: Record<string, unknown>;
}): Promise<string> {
  const verificationId = newUuid();
  const pcId = playerCardsId(input.gameId, input.claimantId);
  const { data: row } = await supabase
    .from("player_cards")
    .select("*")
    .eq("id", pcId)
    .single();
  if (!row) throw new Error("Player cards not found");
  const cards = [...((row.cards as Record<string, unknown>[]) ?? [])];
  const idx = cards.findIndex((c) => {
    if (!isChallengeCardType(String(c.type))) return false;
    if (String(c.id) !== input.cardId) return false;
    return Number(c.hole) === input.cardHole;
  });
  if (idx < 0) throw new Error("Challenge not found");
  if (cards[idx]!.claimed === true)
    throw new Error("Challenge already claimed");
  if (cards[idx]!.verificationPending === true) {
    throw new Error("Challenge is already awaiting verification");
  }
  const rawChallenge = cards[idx] as Record<string, unknown>;
  const deputyIdRaw = rawChallenge.trialCombatDeputyId;
  const deputyNameRaw = rawChallenge.trialCombatDeputyName;
  const deputyId =
    deputyIdRaw != null && String(deputyIdRaw).trim() !== ""
      ? String(deputyIdRaw)
      : null;
  const deputyName =
    deputyNameRaw != null && String(deputyNameRaw).trim() !== ""
      ? String(deputyNameRaw)
      : null;

  const clearedChallenge = { ...rawChallenge };
  delete clearedChallenge.trialCombatDeputyId;
  delete clearedChallenge.trialCombatDeputyName;

  const insertBase: Record<string, unknown> = {
    id: verificationId,
    game_id: input.gameId,
    claimant_id: input.claimantId,
    claimant_name: input.claimantName,
    card_id: input.cardId,
    hole: input.cardHole,
    points_to_award: input.pointsToAward,
    challenge_title: input.cardSummary.title as string,
    challenge_description: input.cardSummary.description as string,
    challenge_type: String(input.cardSummary.type ?? ""),
    status: "pending",
    created_at: nowIso(),
  };

  const hasDeputy =
    deputyId != null ||
    (deputyName != null && String(deputyName).trim() !== "");

  const insertPayload: Record<string, unknown> = { ...insertBase };
  if (hasDeputy) {
    insertPayload.deputy_id = deputyId;
    insertPayload.deputy_name = deputyName;
  }

  let { error: cvInsertError } = await supabase
    .from("challenge_verifications")
    .insert(insertPayload);

  if (
    cvInsertError &&
    isChallengeVerificationDeputyColumnError(cvInsertError) &&
    hasDeputy
  ) {
    const r2 = await supabase
      .from("challenge_verifications")
      .insert({ ...insertBase });
    cvInsertError = r2.error;
  }

  if (cvInsertError) {
    throw new Error(
      cvInsertError.message ||
        "Could not create challenge verification; check Supabase logs and table `challenge_verifications`.",
    );
  }

  cards[idx] = {
    ...clearedChallenge,
    verificationPending: true,
    verificationRequestId: verificationId,
  };
  const { error: pcUpdateError } = await supabase
    .from("player_cards")
    .update({ cards, updated_at: nowIso() })
    .eq("id", pcId);
  if (pcUpdateError) {
    throw new Error(
      pcUpdateError.message ||
        "Verification row was created but hand could not be updated; try Verifications screen or support.",
    );
  }
  await addGameEvent({
    gameId: input.gameId,
    playerId: input.claimantId,
    playerName: input.claimantName,
    eventType: "challenge_verification_requested",
    eventData: {
      verificationId,
      cardId: input.cardId,
      hole: input.cardHole,
      pointsToAward: input.pointsToAward,
      title: input.cardSummary.title,
      description: input.cardSummary.description,
      ...(deputyId != null ? { deputyId, deputyName: deputyName ?? "" } : {}),
    },
  });
  return verificationId;
}

export async function confirmChallengeVerification(input: {
  gameId: string;
  verificationId: string;
  verifierId: string;
  verifierName: string;
}): Promise<void> {
  await applyChallengeVerificationOutcome({
    ...input,
    outcome: "succeeded",
  });
}

/** Marks verification failed: no points; challenge card is consumed (`claimed`). */
export async function failChallengeVerification(input: {
  gameId: string;
  verificationId: string;
  verifierId: string;
  verifierName: string;
}): Promise<void> {
  await applyChallengeVerificationOutcome({
    ...input,
    outcome: "failed",
  });
}

async function applyChallengeVerificationOutcome(input: {
  gameId: string;
  verificationId: string;
  verifierId: string;
  verifierName: string;
  outcome: "succeeded" | "failed";
}): Promise<void> {
  const { data: vRow } = await supabase
    .from("challenge_verifications")
    .select("*")
    .eq("id", input.verificationId)
    .eq("game_id", input.gameId)
    .single();
  if (!vRow || vRow.status !== "pending") {
    throw new Error("Verification is no longer pending");
  }
  const claimantId = String(vRow.claimant_id ?? "");
  if (claimantId === input.verifierId) {
    throw new Error("You cannot verify your own challenge");
  }
  const cardId = String(vRow.card_id ?? "");
  const cardHole = Number(vRow.hole ?? 1);
  const pointsToAward = Number(vRow.points_to_award ?? 0);
  const deputyId = String(vRow.deputy_id ?? "").trim();
  const hasDeputy = deputyId.length > 0;

  const pcId = playerCardsId(input.gameId, claimantId);
  const { data: pcRow } = await supabase
    .from("player_cards")
    .select("*")
    .eq("id", pcId)
    .single();
  if (!pcRow) throw new Error("Player cards not found");
  const cards = [...((pcRow.cards as Record<string, unknown>[]) ?? [])];
  const idx = cards.findIndex((c) => {
    if (!isChallengeCardType(String(c.type))) return false;
    if (String(c.id) !== cardId) return false;
    return Number(c.hole) === cardHole;
  });
  if (idx < 0) throw new Error("Challenge card not found");
  if (cards[idx]!.verificationRequestId !== input.verificationId) {
    throw new Error("Challenge no longer matches this verification");
  }
  cards[idx] = {
    ...cards[idx]!,
    claimed: true,
    verificationPending: undefined,
    verificationRequestId: undefined,
  };

  const now = nowIso();
  const succeeded = input.outcome === "succeeded";

  await supabase
    .from("challenge_verifications")
    .update(
      succeeded
        ? {
            status: "confirmed",
            verifier_id: input.verifierId,
            verifier_name: input.verifierName,
            resolved_at: now,
            confirmation: {
              byPlayerId: input.verifierId,
              byPlayerName: input.verifierName,
              confirmedAt: now,
            },
          }
        : {
            status: "failed",
            verifier_id: input.verifierId,
            verifier_name: input.verifierName,
            resolved_at: now,
            confirmation: {
              byPlayerId: input.verifierId,
              byPlayerName: input.verifierName,
              resolvedAt: now,
              outcome: "failed",
            },
          },
    )
    .eq("id", input.verificationId);

  if (succeeded && pointsToAward > 0) {
    await applyPointDeltas(input.gameId, {
      [claimantId]: pointsToAward,
      ...(hasDeputy ? { [deputyId]: pointsToAward } : {}),
    });
  }

  if (!succeeded && hasDeputy) {
    await applyPointDeltas(input.gameId, { [claimantId]: -1 });
  }

  await supabase
    .from("player_cards")
    .update({ cards, updated_at: nowIso() })
    .eq("id", pcId);

  if (succeeded) {
    await addGameEvent({
      gameId: input.gameId,
      playerId: claimantId,
      playerName: String(vRow.claimant_name ?? "Player"),
      eventType: "challenge_claimed",
      eventData: {
        id: cardId,
        pointsAwarded: pointsToAward,
        verifiedBy: input.verifierName,
        verifierId: input.verifierId,
        verificationId: input.verificationId,
        ...(hasDeputy ? { trialCombatDeputyId: deputyId } : {}),
      },
    });
    await addGameEvent({
      gameId: input.gameId,
      playerId: input.verifierId,
      playerName: input.verifierName,
      eventType: "challenge_verification_confirmed",
      eventData: {
        verificationId: input.verificationId,
        claimantId,
        claimantName: vRow.claimant_name,
        title: vRow.challenge_title,
      },
    });
  } else {
    await addGameEvent({
      gameId: input.gameId,
      playerId: input.verifierId,
      playerName: input.verifierName,
      eventType: "challenge_verification_failed",
      eventData: {
        verificationId: input.verificationId,
        claimantId,
        claimantName: vRow.claimant_name,
        title: vRow.challenge_title,
      },
    });
  }

  await maybeFreeChallengeRerollAfterVerification(input.gameId, claimantId);
}

async function maybeFreeChallengeRerollAfterVerification(
  gameId: string,
  claimantId: string,
): Promise<void> {
  const { data: g } = await supabase
    .from("games")
    .select("*")
    .eq("id", gameId)
    .single();
  if (!g) return;
  const hole = Number(g.current_hole ?? 1);
  const pcId = playerCardsId(gameId, claimantId);
  const { data: pc } = await supabase
    .from("player_cards")
    .select("*")
    .eq("id", pcId)
    .maybeSingle();
  if (!pc) return;
  const cards = (pc.cards as Record<string, unknown>[]) ?? [];
  const forHole = cards.filter(
    (c) =>
      isChallengeCardType(String(c.type)) && Number(c.hole ?? hole) === hole,
  );
  if (forHole.length !== 3) return;
  if (!forHole.every((c) => c.claimed === true)) return;
  try {
    await cardRepo.rerollPlayerChallenges(gameId, claimantId, {
      free: true,
      hideNextChallengeDrawPopup: true,
    });
  } catch {
    /* ignore */
  }
}
