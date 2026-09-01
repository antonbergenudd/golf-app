import { supabase } from "../../lib/supabase";
import { newUuid } from "../../lib/ids";

/** Lobby statuses that still accept a join-by-code. */
export const ALL_STATUSES_OPEN = ["waiting", "active"];

/** One free manual reroll per hole per tab (challenges vs market). */
export const REROLL_HAND_MAX_USES = 1;

export function nowIso(): string {
  return new Date().toISOString();
}

/** Firestore-era composite key: one `player_cards` row per (game, player). */
export function playerCardsId(gameId: string, playerId: string): string {
  return `${gameId}_${playerId}`;
}

/**
 * Unique realtime topic. `supabase.channel(name)` is a singleton, so a fresh
 * suffix per subscriber keeps `.on()` calls from stacking onto a live channel.
 * `:` is avoided — some clients normalise it inside topic names.
 */
export function channelTopic(prefix: string): string {
  return `${prefix}_sub_${newUuid()}`;
}

/** Remote DB may not have applied `20260509180000_challenge_verifications_deputy.sql` yet. */
export function isChallengeVerificationDeputyColumnError(error: {
  code?: string;
  message?: string;
}): boolean {
  const m = String(error.message ?? "").toLowerCase();
  return m.includes("deputy_id") || m.includes("deputy_name");
}

export function generateLobbyCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += chars[Math.floor(Math.random() * chars.length)]!;
  }
  return out;
}

/** Everyone begins the round with this balance (games created via `createGame`). */
export function initialPlayerPoints(
  playerIds: string[],
  each: number,
): Record<string, number> {
  const n = Math.min(10, Math.max(0, Math.floor(Number(each))));
  const out: Record<string, number> = {};
  for (const id of playerIds) {
    if (id) out[id] = n;
  }
  return out;
}

/**
 * Load-then-subscribe boilerplate shared by every `subscribe*` helper: run
 * `load()` once, re-run it on any matching `postgres_changes` event, and return
 * an unsubscribe. Pass `filter` (e.g. `id=eq.<uuid>`) whenever the caller only
 * cares about one row — without it every client re-queries the whole table on
 * every write anywhere in it.
 */
export function subscribeTable(opts: {
  topic: string;
  table: string;
  filter?: string;
  load: () => Promise<void> | void;
}): () => void {
  void opts.load();
  const ch = supabase
    .channel(channelTopic(opts.topic))
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: opts.table,
        ...(opts.filter ? { filter: opts.filter } : {}),
      },
      () => void opts.load(),
    )
    .subscribe();
  return () => void supabase.removeChannel(ch);
}

/**
 * Read `games.player_points`, apply `merge`, write it back.
 *
 * NOTE: client-side read-modify-write — two concurrent callers can clobber each
 * other. See `applyPointDeltas` for the atomic path.
 */
export async function mergeGamePoints(
  gameId: string,
  merge: (prev: Record<string, number>) => Record<string, number>,
): Promise<void> {
  const { data } = await supabase
    .from("games")
    .select("player_points")
    .eq("id", gameId)
    .single();
  const prev = (data?.player_points as Record<string, number>) ?? {};
  const next = merge({ ...prev });
  await supabase
    .from("games")
    .update({ player_points: next, updated_at: nowIso() })
    .eq("id", gameId);
}

export async function addGameEvent(input: {
  gameId: string;
  playerId: string;
  playerName: string;
  eventType: string;
  eventData: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabase.from("game_events").insert({
    game_id: input.gameId,
    player_id: input.playerId,
    player_name: input.playerName,
    event_type: input.eventType,
    event_data: input.eventData,
    timestamp: nowIso(),
  });
  if (error) {
    throw new Error(
      error.message ||
        "Could not write game_events row; check Supabase logs, RLS, and that table `game_events` exists.",
    );
  }
}
