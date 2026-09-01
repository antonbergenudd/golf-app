import { isChallengeCardType } from "../../models/card";
import type { AttackResolveOutcome } from "../../models/attackResolveOutcome";
import { supabase } from "../../lib/supabase";
import {
  generateRoundCards,
  mergeKeptActionsForHoleReroll,
  pickCards,
  pickTieredChallengeDraw,
} from "../cardEngine";
import * as gameRepo from "./gameRepo";
import * as verificationRepo from "./verificationRepo";
import {
  addGameEvent,
  applyPointDeltas,
  asJson,
  mutatePlayerCards,
  nowIso,
  playerCardsId,
  REROLL_HAND_MAX_USES,
  subscribeTable,
} from "./shared";

type CardRow = Record<string, unknown>;

export async function distributePlayerCards(
  gameId: string,
  playerIds: string[],
  opts?: { cancelChallengePendingHole?: number },
): Promise<void> {
  if (opts?.cancelChallengePendingHole != null) {
    for (const pid of playerIds) {
      await verificationRepo.cancelPendingChallengeVerificationsForPlayerHole(
        gameId,
        pid,
        opts.cancelChallengePendingHole,
      );
    }
  }

  const { data: gameRow } = await supabase
    .from("games")
    .select("current_hole")
    .eq("id", gameId)
    .single();
  const currentHole = Number(
    (gameRow as { current_hole?: number } | null)?.current_hole ?? 1,
  );

  await supabase.from("global_effects").upsert({
    game_id: gameId,
    hole: currentHole,
    passive_effects: [],
    direct_cards: [],
    updated_at: nowIso(),
  });

  const passiveEffectsAccum: Record<string, unknown>[] = [];

  for (const playerId of playerIds) {
    const bankedActions: Record<string, unknown>[] = [];
    const pcId = playerCardsId(gameId, playerId);
    const { data: existingRow } = await supabase
      .from("player_cards")
      .select("*")
      .eq("id", pcId)
      .maybeSingle();

    if (existingRow) {
      const existingCards =
        (existingRow.cards as Record<string, unknown>[]) ?? [];
      for (const card of existingCards) {
        if (card.type !== "action") continue;
        const banked = card.banked === true;
        const pendingBank = card.pendingBank === true;
        if (!banked && !pendingBank) continue;
        const copy = { ...card };
        if (pendingBank) {
          copy.banked = true;
          delete copy.pendingBank;
          delete copy.offerConsumed;
        }
        bankedActions.push(copy);
      }
    }

    const newRound = generateRoundCards(playerId, currentHole);
    const challengeCards = newRound.filter((c) =>
      isChallengeCardType(String(c.type)),
    );
    const bankedIds = new Set(
      bankedActions.map((c) => c.id as string).filter(Boolean),
    );
    const freshOffers = pickCards("action", {
      count: 3,
      playerId,
      hole: currentHole,
      excludeCardIds: bankedIds,
    });
    const actionCards = [...bankedActions, ...freshOffers];
    const playerCardsJson = [...challengeCards, ...actionCards];

    await supabase.from("player_cards").upsert({
      id: pcId,
      game_id: gameId,
      player_id: playerId,
      cards: asJson(playerCardsJson),
      hole: currentHole,
      challenge_rerolls_used: 0,
      action_rerolls_used: 0,
      created_at: nowIso(),
      updated_at: nowIso(),
    });

    for (const ch of challengeCards) {
      passiveEffectsAccum.push({
        ...ch,
        playerId,
        hole: currentHole,
      });
    }
  }

  await supabase
    .from("global_effects")
    .update({
      passive_effects: asJson(passiveEffectsAccum),
      hole: currentHole,
      updated_at: nowIso(),
    })
    .eq("game_id", gameId);
}

export async function markChallengeClaimed(input: {
  gameId: string;
  playerId: string;
  cardId: string;
  cardHole: number;
}): Promise<void> {
  const pcId = playerCardsId(input.gameId, input.playerId);
  await mutatePlayerCards(pcId, (cards) => {
    const idx = cards.findIndex((c) => {
      if (!isChallengeCardType(String(c.type))) return false;
      if (String(c.id) !== input.cardId) return false;
      return Number(c.hole) === input.cardHole;
    });
    if (idx < 0) throw new Error("Challenge not found");
    if (cards[idx]!.claimed === true)
      throw new Error("Challenge already claimed");
    if (cards[idx]!.verificationPending === true) {
      throw new Error("Challenge is awaiting verification");
    }
    cards[idx] = { ...cards[idx]!, claimed: true };
    return { cards };
  });
}

export async function assignTrialCombatDeputy(input: {
  gameId: string;
  sponsorId: string;
  deputyId: string;
  deputyName: string;
  challengeCardId: string;
  cardHole: number;
}): Promise<void> {
  if (input.deputyId === input.sponsorId) {
    throw new Error("You cannot assign yourself as fighter");
  }
  const pcId = playerCardsId(input.gameId, input.sponsorId);
  await mutatePlayerCards(pcId, (cards) => {
    const idx = cards.findIndex((c) => {
      if (!isChallengeCardType(String(c.type))) return false;
      if (String(c.id) !== input.challengeCardId) return false;
      return Number(c.hole) === input.cardHole;
    });
    if (idx < 0) throw new Error("Challenge not found");
    if (cards[idx]!.claimed === true)
      throw new Error("Challenge already claimed");
    if (cards[idx]!.verificationPending === true) {
      throw new Error("Challenge is already awaiting verification");
    }
    cards[idx] = {
      ...cards[idx]!,
      trialCombatDeputyId: input.deputyId,
      trialCombatDeputyName: input.deputyName,
    };
    return { cards };
  });
}

export async function markHoleActionConsumed(input: {
  gameId: string;
  playerId: string;
  cardId: string;
  cardHole: number;
}): Promise<void> {
  const { data: g } = await supabase
    .from("games")
    .select("*")
    .eq("id", input.gameId)
    .single();
  if (!g) throw new Error("Game not found");
  const cur = Number(g.current_hole ?? 1);
  if (input.cardHole !== cur)
    throw new Error("That action is not part of this hole's offers");

  const pcId = playerCardsId(input.gameId, input.playerId);
  await mutatePlayerCards(pcId, (cards) => {
    const idx = cards.findIndex((c) => {
      if (c.type !== "action") return false;
      if (String(c.id) !== input.cardId) return false;
      if (Number(c.hole) !== input.cardHole) return false;
      if (c.offerConsumed === true) return false;
      const banked = c.banked === true;
      const pending = c.pendingBank === true;
      if (banked && !pending) return false;
      return true;
    });
    if (idx < 0) throw new Error("Action offer not found or already used");
    cards[idx] = { ...cards[idx]!, offerConsumed: true };
    return { cards };
  });
}

export async function deleteBankedActionCard(input: {
  gameId: string;
  playerId: string;
  cardId: string;
  cardHole: number;
}): Promise<void> {
  const pcId = playerCardsId(input.gameId, input.playerId);
  await mutatePlayerCards(pcId, (cards) => {
    let idx = cards.findIndex((c) => {
      if (c.type !== "action") return false;
      if (c.banked !== true || c.pendingBank === true) return false;
      if (String(c.id) !== input.cardId) return false;
      return Number(c.hole) === input.cardHole;
    });
    if (idx < 0) {
      idx = cards.findIndex((c) => {
        if (c.type !== "action") return false;
        if (c.banked !== true || c.pendingBank === true) return false;
        return String(c.id) === input.cardId;
      });
    }
    if (idx < 0) throw new Error("Saved action not found");
    cards.splice(idx, 1);
    return { cards };
  });
}

export async function deletePendingBankedActionCard(input: {
  gameId: string;
  playerId: string;
  cardId: string;
  cardHole: number;
}): Promise<void> {
  const pcId = playerCardsId(input.gameId, input.playerId);
  await mutatePlayerCards(pcId, (cards) => {
    let idx = cards.findIndex((c) => {
      if (c.type !== "action") return false;
      if (c.pendingBank !== true) return false;
      if (String(c.id) !== input.cardId) return false;
      return Number(c.hole) === input.cardHole;
    });
    if (idx < 0) {
      idx = cards.findIndex((c) => {
        if (c.type !== "action") return false;
        if (c.pendingBank !== true) return false;
        return String(c.id) === input.cardId;
      });
    }
    if (idx < 0) throw new Error("Pending saved action not found");
    cards.splice(idx, 1);
    return { cards };
  });
}

export async function markPendingBankedActionUsed(input: {
  gameId: string;
  playerId: string;
  cardId: string;
  cardHole: number;
}): Promise<void> {
  const pcId = playerCardsId(input.gameId, input.playerId);
  const { data: gameDoc } = await supabase
    .from("games")
    .select("current_hole")
    .eq("id", input.gameId)
    .single();
  if (!gameDoc) throw new Error("Game not found");
  const curHole = Number(gameDoc.current_hole ?? 1);

  await mutatePlayerCards(pcId, (cards) => {
    // Prefer bag-saved copies (banked) so playing inventory never touches an
    // unrelated market row that shares the same card id + pendingBank.
    let idx = cards.findIndex((c) => {
      if (c.type !== "action") return false;
      if (c.inventoryUsed === true) return false;
      if (c.banked !== true) return false;
      if (String(c.id) !== input.cardId) return false;
      const hole = c.hole != null ? Number(c.hole) : null;
      return hole === null || hole === input.cardHole;
    });
    if (idx < 0) {
      idx = cards.findIndex((c) => {
        if (c.type !== "action") return false;
        if (c.inventoryUsed === true) return false;
        if (c.pendingBank !== true || c.banked === true) return false;
        if (String(c.id) !== input.cardId) return false;
        const hole = c.hole != null ? Number(c.hole) : null;
        return hole === null || hole === input.cardHole;
      });
    }
    if (idx < 0) throw new Error("Saved action not found");

    const played = cards[idx]!;
    const playedHole =
      played.hole != null ? Number(played.hole) : input.cardHole;

    // Strip stays full: consume from bag but refill this hole's slot with a fresh offer.
    if (played.type === "action" && playedHole === curHole) {
      const excludeIds = new Set<string>();
      for (let i = 0; i < cards.length; i++) {
        if (i === idx) continue;
        const c = cards[i]!;
        if (c.type === "action" && Number(c.hole ?? 0) === curHole) {
          const id = String(c.id ?? "");
          if (id) excludeIds.add(id);
        }
      }
      const pool = pickCards("action", {
        count: 1,
        playerId: input.playerId,
        hole: curHole,
        excludeCardIds: excludeIds,
      });
      cards[idx] =
        pool.length > 0 ? pool[0]! : { ...played, inventoryUsed: true };
    } else {
      cards[idx] = { ...played, inventoryUsed: true };
    }

    return { cards };
  });
}

export async function removeActionCardByIdHole(input: {
  gameId: string;
  playerId: string;
  cardId: string;
  cardHole: number;
}): Promise<void> {
  const pcId = playerCardsId(input.gameId, input.playerId);
  await mutatePlayerCards(pcId, (cards) => {
    const idx = cards.findIndex((c) => {
      if (c.type !== "action") return false;
      if (String(c.id) !== input.cardId) return false;
      const h = c.hole != null ? Number(c.hole) : null;
      return h === null || h === input.cardHole;
    });
    if (idx < 0) throw new Error("Action card not found");
    cards.splice(idx, 1);
    return { cards };
  });
}

export function subscribePlayerCards(
  gameId: string,
  playerId: string,
  onNext: (doc: Record<string, unknown> | null) => void,
): () => void {
  const id = playerCardsId(gameId, playerId);
  return subscribeTable({
    topic: `pc-${id}`,
    table: "player_cards",
    filter: `id=eq.${id}`,
    load: async () => {
      const { data } = await supabase
        .from("player_cards")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      onNext(data as Record<string, unknown> | null);
    },
  });
}

export async function clearHideNextChallengeDrawPopup(
  gameId: string,
  playerId: string,
): Promise<void> {
  const pcId = playerCardsId(gameId, playerId);
  await supabase
    .from("player_cards")
    .update({ hide_next_challenge_draw_popup: null, updated_at: nowIso() })
    .eq("id", pcId);
}

export function subscribeAllPlayerCards(
  gameId: string,
  onNext: (docs: Record<string, unknown>[]) => void,
): () => void {
  return subscribeTable({
    topic: `pc-game-${gameId}`,
    table: "player_cards",
    filter: `game_id=eq.${gameId}`,
    load: async () => {
      const { data } = await supabase
        .from("player_cards")
        .select("*")
        .eq("game_id", gameId);
      onNext(data ?? []);
    },
  });
}

export async function rerollPlayerChallenges(
  gameId: string,
  playerId: string,
  opts?: { free?: boolean; hideNextChallengeDrawPopup?: boolean },
): Promise<void> {
  const free = opts?.free ?? false;
  const { data: gameDoc } = await supabase
    .from("games")
    .select("*")
    .eq("id", gameId)
    .single();
  if (!gameDoc) throw new Error("Game not found");
  const currentHole = Number(gameDoc.current_hole ?? 1);

  const pcId = playerCardsId(gameId, playerId);
  // Draw once outside the retry loop so the global_effects write below matches
  // exactly what lands in the hand.
  const newChallenges = pickTieredChallengeDraw(playerId, currentHole);

  await mutatePlayerCards(pcId, (cards, row) => {
    const rerollsUsed = Number(row.challenge_rerolls_used ?? 0);
    const challenges = cards.filter((c) => isChallengeCardType(String(c.type)));
    const actions = cards.filter((c) => c.type === "action");

    if (!free && rerollsUsed >= REROLL_HAND_MAX_USES) {
      throw new Error("Challenge reroll limit reached");
    }
    if (!free && challenges.length === 0) {
      throw new Error("No challenges to reroll");
    }

    const extra: Record<string, unknown> = {
      challenge_rerolls_used: free ? rerollsUsed : rerollsUsed + 1,
    };
    if (opts?.hideNextChallengeDrawPopup) {
      extra.hide_next_challenge_draw_popup = true;
    }
    return { cards: [...newChallenges, ...actions], extra };
  });

  const { data: geRow } = await supabase
    .from("global_effects")
    .select("*")
    .eq("game_id", gameId)
    .maybeSingle();
  const passive = [
    ...((geRow?.passive_effects as Record<string, unknown>[]) ?? []).filter(
      (e) => e.playerId !== playerId,
    ),
    ...newChallenges.map((c) => ({
      ...c,
      playerId,
      hole: currentHole,
    })),
  ];
  await supabase.from("global_effects").upsert({
    game_id: gameId,
    passive_effects: asJson(passive),
    hole: currentHole,
    updated_at: nowIso(),
  });

  await verificationRepo.cancelPendingChallengeVerificationsForPlayerHole(
    gameId,
    playerId,
    currentHole,
  );
}

export async function rerollPlayerActions(
  gameId: string,
  playerId: string,
  opts?: { free?: boolean; hideNextChallengeDrawPopup?: boolean },
): Promise<void> {
  const { data: gameDoc } = await supabase
    .from("games")
    .select("*")
    .eq("id", gameId)
    .single();
  if (!gameDoc) throw new Error("Game not found");
  const currentHole = Number(gameDoc.current_hole ?? 1);

  const pcId = playerCardsId(gameId, playerId);
  await mutatePlayerCards(pcId, (cards, row) => {
    const rerollsUsed = Number(row.action_rerolls_used ?? 0);
    if (rerollsUsed >= REROLL_HAND_MAX_USES) {
      throw new Error("Action reroll limit reached");
    }

    const challenges = cards.filter((c) => isChallengeCardType(String(c.type)));
    const actions = cards.filter((c) => c.type === "action");
    if (actions.length === 0) throw new Error("No actions to reroll");

    const keptActions = mergeKeptActionsForHoleReroll(actions, currentHole);
    const excludeIds = new Set(
      keptActions.map((c) => String(c.id)).filter(Boolean),
    );
    const newActions = pickCards("action", {
      count: 3,
      playerId,
      hole: currentHole,
      excludeCardIds: excludeIds,
    });

    const extra: Record<string, unknown> = {
      action_rerolls_used: rerollsUsed + 1,
    };
    if (opts?.hideNextChallengeDrawPopup) {
      extra.hide_next_challenge_draw_popup = true;
    }
    return { cards: [...challenges, ...keptActions, ...newActions], extra };
  });
}

export async function bankHoleOfferAction(input: {
  gameId: string;
  playerId: string;
  cardId: string;
  cardHole: number;
}): Promise<void> {
  const { data: gameDoc } = await supabase
    .from("games")
    .select("*")
    .eq("id", input.gameId)
    .single();
  if (!gameDoc) throw new Error("Game not found");
  const currentHole = Number(gameDoc.current_hole ?? 1);
  const lockedRaw =
    (gameDoc.action_buy_locked_until_hole as Record<string, number>) ?? {};
  const lockedUntil = lockedRaw[input.playerId] ?? 0;
  if (lockedUntil >= currentHole) {
    throw new Error("Action buying is locked for this hole");
  }
  if (input.cardHole !== currentHole) {
    throw new Error("That action is not part of this hole's offers");
  }

  const pcId = playerCardsId(input.gameId, input.playerId);
  const pp = (gameDoc.player_points as Record<string, number>) ?? {};
  const balance = pp[input.playerId] ?? 0;

  const buyCost = await mutatePlayerCards<number>(pcId, (cards) => {
    const idx = cards.findIndex((c) => {
      if (c.type !== "action") return false;
      if (c.banked === true) return false;
      if (c.pendingBank === true) return false;
      if (c.offerConsumed === true) return false;
      if (String(c.id) !== input.cardId) return false;
      return Number(c.hole) === input.cardHole;
    });
    if (idx < 0) throw new Error("Action offer not found or already saved");

    const cost = Math.min(
      9999,
      Math.max(0, Number((cards[idx]!.points as number) ?? 1)),
    );
    if (balance < cost) {
      throw new Error(`Need at least ${cost} points to save an action`);
    }

    cards[idx] = { ...cards[idx]!, offerConsumed: true, pendingBank: true };
    return { cards, result: cost };
  });

  // Mark first, then charge: a rare process death here leaves a saved-but-unpaid
  // card, which is more player-friendly than the old order's paid-but-lost card.
  if (buyCost && buyCost > 0) {
    await gameRepo.deductPoints(input.gameId, input.playerId, buyCost);
  }
}

function isPlayableActionCandidate(c: Record<string, unknown>): boolean {
  if (c.type !== "action") return false;
  if (c.inventoryUsed === true) return false;
  const banked = c.banked === true;
  const pending = c.pendingBank === true;
  const consumed = c.offerConsumed === true;
  if (consumed && !banked && !pending) return false;
  return true;
}

export async function stealRandomActionCardFromPlayer(input: {
  gameId: string;
  thiefPlayerId: string;
  targetPlayerId: string;
}): Promise<
  | { ok: true; card: Record<string, unknown> }
  | { ok: false; reason: "no_cards" }
> {
  const thiefRef = playerCardsId(input.gameId, input.thiefPlayerId);
  const targetRef = playerCardsId(input.gameId, input.targetPlayerId);

  const removed = await mutatePlayerCards<CardRow>(targetRef, (cards) => {
    const candidateIndexes: number[] = [];
    for (let i = 0; i < cards.length; i++) {
      if (isPlayableActionCandidate(cards[i]!)) candidateIndexes.push(i);
    }
    if (candidateIndexes.length === 0) return null;
    const removeIdx =
      candidateIndexes[Math.floor(Math.random() * candidateIndexes.length)]!;
    const card = { ...cards.splice(removeIdx, 1)[0]! };
    card.banked = true;
    delete card.pendingBank;
    delete card.inventoryUsed;
    delete card.offerConsumed;
    return { cards, result: card };
  });

  if (!removed) return { ok: false, reason: "no_cards" };

  await mutatePlayerCards(thiefRef, (cards) => ({
    cards: [...cards, removed],
  }));
  return { ok: true, card: removed };
}

export async function destroyRandomActionCardFromPlayer(input: {
  gameId: string;
  targetPlayerId: string;
}): Promise<
  | { ok: true; card: Record<string, unknown> }
  | { ok: false; reason: "no_cards" }
> {
  const targetRef = playerCardsId(input.gameId, input.targetPlayerId);

  const destroyed = await mutatePlayerCards<CardRow>(targetRef, (cards) => {
    const candidateIndexes: number[] = [];
    for (let i = 0; i < cards.length; i++) {
      if (isPlayableActionCandidate(cards[i]!)) candidateIndexes.push(i);
    }
    if (candidateIndexes.length === 0) return null;
    const removeIdx =
      candidateIndexes[Math.floor(Math.random() * candidateIndexes.length)]!;
    const card = { ...cards.splice(removeIdx, 1)[0]! };
    return { cards, result: card };
  });

  if (!destroyed) return { ok: false, reason: "no_cards" };
  return { ok: true, card: destroyed };
}

/** Random 1-5 pts transfer from target to thief, capped by target balance. */
async function stealRandomPointsBetweenPlayers(input: {
  gameId: string;
  thiefId: string;
  targetId: string;
}): Promise<{ ok: true; amount: number } | { ok: false }> {
  const roll = 1 + Math.floor(Math.random() * 5);
  const { data } = await supabase
    .from("games")
    .select("player_points")
    .eq("id", input.gameId)
    .single();
  const pp = (data?.player_points as Record<string, number>) ?? {};
  const targetBal = Math.max(0, Math.floor(pp[input.targetId] ?? 0));
  if (targetBal <= 0) return { ok: false };
  const take = Math.min(roll, targetBal);
  await applyPointDeltas(input.gameId, {
    [input.targetId]: -take,
    [input.thiefId]: take,
  });
  return { ok: true, amount: take };
}

/** Resolve attack effects after the card is marked used (inventory). */
export async function resolvePlayedAttackCard(input: {
  gameId: string;
  attackerId: string;
  attackerName: string;
  targetPlayerId: string;
  targetPlayerName: string;
  card: Record<string, unknown>;
}): Promise<AttackResolveOutcome> {
  const id = String(input.card.id ?? "");
  const cardTitle = String(input.card.title ?? "Attack");

  let outcome: AttackResolveOutcome;

  switch (id) {
    case "action_022": {
      const r = await stealRandomActionCardFromPlayer({
        gameId: input.gameId,
        thiefPlayerId: input.attackerId,
        targetPlayerId: input.targetPlayerId,
      });
      if (!r.ok) outcome = { kind: "no_stealable_cards" };
      else {
        outcome = {
          kind: "stole_card",
          cardTitle: String(r.card.title ?? "Action card"),
        };
      }
      break;
    }
    case "action_023": {
      const r = await destroyRandomActionCardFromPlayer({
        gameId: input.gameId,
        targetPlayerId: input.targetPlayerId,
      });
      if (!r.ok) outcome = { kind: "nothing_to_destroy" };
      else {
        outcome = {
          kind: "destroyed_card",
          cardTitle: String(r.card.title ?? "action"),
        };
      }
      break;
    }
    case "action_024":
      await gameRepo.lockActionBuyingForCurrentHole({
        gameId: input.gameId,
        targetPlayerId: input.targetPlayerId,
      });
      outcome = { kind: "market_locked" };
      break;
    case "action_025": {
      const r = await stealRandomPointsBetweenPlayers({
        gameId: input.gameId,
        thiefId: input.attackerId,
        targetId: input.targetPlayerId,
      });
      if (!r.ok) outcome = { kind: "no_points_to_steal" };
      else outcome = { kind: "stole_points", amount: r.amount };
      break;
    }
    case "action_030":
      await gameRepo.armActionStealForPlayer({
        gameId: input.gameId,
        playerId: input.attackerId,
      });
      outcome = { kind: "action_steal_armed" };
      break;
    default:
      outcome = { kind: "tabletop", cardTitle };
  }

  await addGameEvent({
    gameId: input.gameId,
    playerId: input.attackerId,
    playerName: input.attackerName.trim() || "Someone",
    eventType: "attack_resolved",
    eventData: {
      targetPlayerId: input.targetPlayerId,
      targetPlayerName: input.targetPlayerName.trim() || "Player",
      attackCardId: id,
      attackCardTitle: cardTitle,
      outcome: outcome as unknown as Record<string, unknown>,
    },
  });

  return outcome;
}

export async function resolveActionStealCopiesForPlayedAction(input: {
  gameId: string;
  sourcePlayerId: string;
  sourceActionCard: Record<string, unknown>;
}): Promise<void> {
  const title = String(input.sourceActionCard.title ?? "")
    .toLowerCase()
    .trim();
  if (title === "action steal") return;
  if (input.sourceActionCard.type !== "action") return;

  const { data: gameDoc } = await supabase
    .from("games")
    .select("*")
    .eq("id", input.gameId)
    .single();
  if (!gameDoc) return;
  const armedRaw =
    (gameDoc.action_steal_armed as Record<string, boolean>) ?? {};
  const armedPlayers = Object.entries(armedRaw)
    .filter(([, v]) => v === true)
    .map(([k]) => k);
  if (armedPlayers.length === 0) return;

  const now = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  for (const playerId of armedPlayers) {
    const pcId = playerCardsId(input.gameId, playerId);
    const { data: pcRow } = await supabase
      .from("player_cards")
      .select("*")
      .eq("id", pcId)
      .maybeSingle();
    if (!pcRow) continue;
    const cards = [...((pcRow.cards as Record<string, unknown>[]) ?? [])];
    const originalId = String(input.sourceActionCard.id ?? "action_copy");
    const copyId = `${originalId}_copy_${now}_${Math.floor(Math.random() * 100000)}`;
    const copied: Record<string, unknown> = {
      ...input.sourceActionCard,
      id: copyId,
      copiedCardId: originalId,
      copiedFromPlayerId: input.sourcePlayerId,
      banked: true,
    };
    delete copied.pendingBank;
    delete copied.inventoryUsed;
    delete copied.offerConsumed;
    cards.push(copied);
    await supabase
      .from("player_cards")
      .update({ cards: asJson(cards), updated_at: nowIso() })
      .eq("id", pcId);
  }

  const cleared = { ...armedRaw };
  for (const pid of armedPlayers) delete cleared[pid];
  await supabase
    .from("games")
    .update({ action_steal_armed: cleared, updated_at: nowIso() })
    .eq("id", input.gameId);
}
