import { type GameMode, gameModeValue } from "../../models/gameMode";
import { supabase } from "../../lib/supabase";
import * as cardRepo from "./cardRepo";
import {
  addGameEvent,
  applyPointDeltas,
  initialPlayerPoints,
  nowIso,
  subscribeTable,
} from "./shared";

export async function createGame(input: {
  gameName: string;
  playerIds: string[];
  holes?: number;
  mode?: GameMode;
  startingPointsPerPlayer?: number;
}): Promise<string> {
  const { data, error } = await supabase
    .from("games")
    .insert({
      name: input.gameName,
      player_ids: input.playerIds,
      holes: input.holes ?? 18,
      mode: gameModeValue(input.mode ?? "classic"),
      status: "active",
      current_hole: 1,
      player_points: initialPlayerPoints(
        input.playerIds,
        input.startingPointsPerPlayer ?? 1,
      ),
      hidden_balance_until_hole: {},
      action_buy_locked_until_hole: {},
      action_steal_armed: {},
      created_at: nowIso(),
      updated_at: nowIso(),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id as string;
}

export function subscribeGames(
  onNext: (rows: Record<string, unknown>[]) => void,
): () => void {
  return subscribeTable({
    topic: "games-all",
    table: "games",
    load: async () => {
      const { data } = await supabase
        .from("games")
        .select("*")
        .order("created_at", { ascending: false });
      onNext(data ?? []);
    },
  });
}

export async function updateGameStatus(
  gameId: string,
  status: string,
): Promise<void> {
  await supabase
    .from("games")
    .update({ status, updated_at: nowIso() })
    .eq("id", gameId);
}

/** One-shot fetch — use instead of subscribeGame when realtime isn't needed (e.g. end-game summary). */
export async function fetchGameById(
  gameId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from("games")
    .select("*")
    .eq("id", gameId)
    .maybeSingle();
  if (error) throw error;
  return data as Record<string, unknown> | null;
}

export function subscribeGame(
  gameId: string,
  onNext: (row: Record<string, unknown> | null) => void,
): () => void {
  return subscribeTable({
    topic: `game-${gameId}`,
    table: "games",
    filter: `id=eq.${gameId}`,
    load: async () => {
      const { data } = await supabase
        .from("games")
        .select("*")
        .eq("id", gameId)
        .maybeSingle();
      onNext(data as Record<string, unknown> | null);
    },
  });
}

export function subscribeGlobalEffects(
  gameId: string,
  onNext: (row: Record<string, unknown> | null) => void,
): () => void {
  return subscribeTable({
    topic: `ge-${gameId}`,
    table: "global_effects",
    filter: `game_id=eq.${gameId}`,
    load: async () => {
      const { data } = await supabase
        .from("global_effects")
        .select("*")
        .eq("game_id", gameId)
        .maybeSingle();
      onNext(data as Record<string, unknown> | null);
    },
  });
}

export async function nextHole(
  gameId: string,
  playerIds: string[],
): Promise<void> {
  const { data: gameDoc } = await supabase
    .from("games")
    .select("*")
    .eq("id", gameId)
    .single();
  if (!gameDoc) return;
  const currentHole = Number(gameDoc.current_hole ?? 1);
  const totalHoles = Number(gameDoc.holes ?? 18);
  if (currentHole >= totalHoles) {
    throw new Error(
      `Already on hole ${totalHoles}. Use End game to finish the round.`,
    );
  }
  await supabase
    .from("games")
    .update({
      current_hole: currentHole + 1,
      updated_at: nowIso(),
    })
    .eq("id", gameId);
  await cardRepo.distributePlayerCards(gameId, playerIds, {
    cancelChallengePendingHole: currentHole,
  });
  await addGameEvent({
    gameId,
    playerId: "system",
    playerName: "System",
    eventType: "hole_changed",
    eventData: {
      newHole: currentHole + 1,
      previousHole: currentHole,
    },
  });
}

export async function awardPoints(
  gameId: string,
  playerId: string,
  points: number,
): Promise<void> {
  await applyPointDeltas(gameId, { [playerId]: points });
}

export async function deductPoints(
  gameId: string,
  playerId: string,
  points: number,
): Promise<void> {
  if (points <= 0) return;
  await applyPointDeltas(gameId, { [playerId]: -points });
}

export async function setPlayerBalanceHiddenForCurrentHole(input: {
  gameId: string;
  playerId: string;
}): Promise<void> {
  const { data: g } = await supabase
    .from("games")
    .select("*")
    .eq("id", input.gameId)
    .single();
  if (!g) throw new Error("Game not found");
  const hole = Number(g.current_hole ?? 1);
  const raw = (g.hidden_balance_until_hole as Record<string, number>) ?? {};
  await supabase
    .from("games")
    .update({
      hidden_balance_until_hole: { ...raw, [input.playerId]: hole },
      updated_at: nowIso(),
    })
    .eq("id", input.gameId);
}

export async function lockActionBuyingForCurrentHole(input: {
  gameId: string;
  targetPlayerId: string;
}): Promise<void> {
  const { data: g } = await supabase
    .from("games")
    .select("*")
    .eq("id", input.gameId)
    .single();
  if (!g) throw new Error("Game not found");
  const currentHole = Number(g.current_hole ?? 1);
  const raw = (g.action_buy_locked_until_hole as Record<string, number>) ?? {};
  await supabase
    .from("games")
    .update({
      action_buy_locked_until_hole: {
        ...raw,
        [input.targetPlayerId]: currentHole,
      },
      updated_at: nowIso(),
    })
    .eq("id", input.gameId);
}

export async function armActionStealForPlayer(input: {
  gameId: string;
  playerId: string;
}): Promise<void> {
  const { data: g } = await supabase
    .from("games")
    .select("*")
    .eq("id", input.gameId)
    .single();
  if (!g) throw new Error("Game not found");
  const raw = (g.action_steal_armed as Record<string, boolean>) ?? {};
  await supabase
    .from("games")
    .update({
      action_steal_armed: { ...raw, [input.playerId]: true },
      updated_at: nowIso(),
    })
    .eq("id", input.gameId);
}

export async function resolvePassiveEffect(
  gameId: string,
  playerId: string,
  passiveEffect: Record<string, unknown> & {
    wheelResult?: unknown;
    playerName?: string;
  },
): Promise<void> {
  const { data: geRow } = await supabase
    .from("global_effects")
    .select("*")
    .eq("game_id", gameId)
    .single();
  if (!geRow) throw new Error("Game effects not found");
  const passiveEffects = [
    ...((geRow.passive_effects as Record<string, unknown>[]) ?? []),
  ];
  const idx = passiveEffects.findIndex(
    (e) => e.id === passiveEffect.id && e.playerId === playerId,
  );
  if (idx < 0) throw new Error("Passive effect not found");
  passiveEffects[idx] = {
    ...passiveEffects[idx]!,
    resolved: true,
    wheelResult: passiveEffect.wheelResult,
    resolvedAt: nowIso(),
  };
  await supabase
    .from("global_effects")
    .update({
      passive_effects: passiveEffects,
      updated_at: nowIso(),
    })
    .eq("game_id", gameId);

  await addGameEvent({
    gameId,
    playerId,
    playerName: String(passiveEffect.playerName ?? "Unknown Player"),
    eventType: "passive_effect_resolved",
    eventData: {
      cardId: passiveEffect.id,
      cardTitle: passiveEffect.title,
      wheelResult: passiveEffect.wheelResult,
    },
  });
}
