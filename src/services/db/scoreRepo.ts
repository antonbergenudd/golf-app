import { supabase } from "../../lib/supabase";
import { nowIso, subscribeTable } from "./shared";

export async function addScore(input: {
  playerId: string;
  playerName: string;
  hole: number;
  strokes: number;
  gameId?: string;
}): Promise<void> {
  const { error } = await supabase.from("scores").insert({
    player_id: input.playerId,
    player_name: input.playerName,
    hole: input.hole,
    strokes: input.strokes,
    game_id: input.gameId ?? null,
    created_at: nowIso(),
  });
  if (error) throw error;
}

export function subscribeScores(
  gameId: string | undefined,
  onNext: (rows: Record<string, unknown>[]) => void,
): () => void {
  return subscribeTable({
    topic: `scores-${gameId ?? "all"}`,
    table: "scores",
    filter: gameId ? `game_id=eq.${gameId}` : undefined,
    load: async () => {
      let q = supabase.from("scores").select("*").order("hole");
      if (gameId) q = q.eq("game_id", gameId);
      const { data } = await q;
      onNext(data ?? []);
    },
  });
}

export async function updateScore(
  scoreId: string,
  newStrokes: number,
): Promise<void> {
  const { error } = await supabase
    .from("scores")
    .update({ strokes: newStrokes, updated_at: nowIso() })
    .eq("id", scoreId);
  if (error) throw error;
}

export async function deleteScore(scoreId: string): Promise<void> {
  await supabase.from("scores").delete().eq("id", scoreId);
}

/** Insert or update strokes for this player on this hole (one row per hole). */
export async function saveHoleScore(input: {
  gameId: string;
  playerId: string;
  playerName: string;
  hole: number;
  strokes: number;
}): Promise<void> {
  const hole = Math.max(1, Math.floor(input.hole));
  const strokes = Math.min(30, Math.max(1, Math.floor(input.strokes)));
  const { data: existing, error: selErr } = await supabase
    .from("scores")
    .select("id")
    .eq("game_id", input.gameId)
    .eq("player_id", input.playerId)
    .eq("hole", hole)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing?.id) {
    await updateScore(existing.id as string, strokes);
    return;
  }
  await addScore({
    playerId: input.playerId,
    playerName: input.playerName,
    hole,
    strokes,
    gameId: input.gameId,
  });
}

export async function getPlayerScoresForGame(
  gameId: string,
  playerId: string,
): Promise<Record<string, unknown>[]> {
  const { data } = await supabase
    .from("scores")
    .select("*")
    .eq("game_id", gameId)
    .eq("player_id", playerId)
    .order("hole");
  return data ?? [];
}

export async function getGameTotals(
  gameId: string,
): Promise<Record<string, number>> {
  const { data } = await supabase
    .from("scores")
    .select("*")
    .eq("game_id", gameId);
  const totals: Record<string, number> = {};
  for (const row of data ?? []) {
    const pid = row.player_id as string;
    totals[pid] = (totals[pid] ?? 0) + Number(row.strokes);
  }
  return totals;
}
