import type { Json, TablesUpdate } from "../../lib/database.types";
import { supabase } from "../../lib/supabase";
import { newUuid } from "../../lib/ids";

/**
 * This layer builds card / passive-effect / lobby-player arrays as
 * `Record<string, unknown>[]` and stores them in `jsonb` columns. `asJson`
 * narrows them to `Json` at the write boundary — the generated row types still
 * check every other column name.
 */
export const asJson = (v: unknown): Json => v as Json;

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
 * other. Prefer {@link applyPointDeltas}; this remains the fallback for it.
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

/**
 * Pure form of the points update: apply signed `deltas` to `prev`, flooring
 * every touched balance at 0. Kept identical to the plpgsql in
 * `apply_point_deltas` so the RPC and the fallback agree.
 */
export function applyDeltasToPoints(
  prev: Record<string, number>,
  deltas: Record<string, number>,
): Record<string, number> {
  const next = { ...prev };
  for (const [pid, delta] of Object.entries(deltas)) {
    if (Number(delta) === 0) continue;
    next[pid] = Math.max(0, Math.floor((next[pid] ?? 0) + Number(delta)));
  }
  return next;
}

/**
 * Apply signed `deltas` (playerId -> change) to `games.player_points`.
 *
 * Prefers the atomic `apply_point_deltas` RPC (migration
 * `20260902000000_atomic_game_mutations.sql`). If that function is not present
 * yet, falls back to a client-side read-modify-write. Both paths floor every
 * balance at 0 — the only un-guarded caller (`deductPoints`) is always given a
 * checked amount, so this is a safety net, not a behaviour change in practice.
 */
export async function applyPointDeltas(
  gameId: string,
  deltas: Record<string, number>,
): Promise<void> {
  const clean = Object.fromEntries(
    Object.entries(deltas).filter(([, v]) => Number(v) !== 0),
  );
  if (Object.keys(clean).length === 0) return;

  const { error } = await supabase.rpc("apply_point_deltas", {
    p_game_id: gameId,
    p_deltas: clean,
  });
  if (!error) return;

  const missingFn =
    error.code === "PGRST202" ||
    /could not find the function|does not exist|schema cache/i.test(
      error.message ?? "",
    );
  if (!missingFn) throw error;

  await mergeGamePoints(gameId, (pp) => applyDeltasToPoints(pp, clean));
}

type CardRow = Record<string, unknown>;

/**
 * Optimistic-concurrency wrapper for the many `player_cards` read-modify-write
 * flows (claim a challenge, bank an offer, play from the bag, reroll, …).
 *
 * Reads the row, runs `plan(cards, row)`, then writes back only if the row's
 * `updated_at` is unchanged since the read. On a lost race it re-reads and
 * retries. After `retries` losses it does one unguarded write from the freshest
 * read — never worse than the pre-existing behaviour, just with newer data.
 *
 * `plan` gets a fresh copy of the cards array and the whole row; it returns
 * `{ cards, extra?, result? }` to write or `null` to abort with no write.
 * Throwing from `plan` propagates (used for the "not found" / guard errors).
 */
export async function mutatePlayerCards<T = void>(
  pcId: string,
  plan: (
    cards: CardRow[],
    row: CardRow,
  ) => { cards: CardRow[]; extra?: Record<string, unknown>; result?: T } | null,
  opts?: { retries?: number },
): Promise<T | undefined> {
  const retries = opts?.retries ?? 4;

  for (let attempt = 0; ; attempt++) {
    const { data: row } = await supabase
      .from("player_cards")
      .select("*")
      .eq("id", pcId)
      .maybeSingle();
    if (!row) throw new Error("Player cards not found");

    const cards = [...((row.cards as CardRow[]) ?? [])];
    const planned = plan(cards, row as CardRow);
    if (!planned) return undefined;

    const payload = {
      ...planned.extra,
      cards: asJson(planned.cards),
      updated_at: nowIso(),
    } as TablesUpdate<"player_cards">;
    const lastAttempt = attempt >= retries;

    let write = supabase.from("player_cards").update(payload).eq("id", pcId);
    if (!lastAttempt) {
      write = write.eq("updated_at", row.updated_at as string);
    }
    const { data: written, error } = await write.select("id");
    if (error) throw error;

    if (lastAttempt || (written && written.length > 0)) {
      if (lastAttempt && __DEV__ && !(written && written.length > 0)) {
        console.warn(
          `[mutatePlayerCards] ${pcId} lost ${retries} races; wrote unguarded`,
        );
      }
      return planned.result;
    }
    await new Promise((r) => setTimeout(r, 40 + Math.random() * 90));
  }
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
    event_data: asJson(input.eventData),
    timestamp: nowIso(),
  });
  if (error) {
    throw new Error(
      error.message ||
        "Could not write game_events row; check Supabase logs, RLS, and that table `game_events` exists.",
    );
  }
}
