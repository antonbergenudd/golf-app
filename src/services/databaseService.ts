import {
  type GameMode,
  gameModeValue,
} from "../models/gameMode";
import { isChallengeCardType } from "../models/card";
import type { AttackResolveOutcome } from "../models/attackResolveOutcome";
import {
  type Lobby,
  lobbyFromRow,
  lobbyHelpers,
  type LobbyPlayer,
  lobbyPlayersToJson,
  lobbyToInsert,
} from "../models/lobby";
import { supabase } from "../lib/supabase";
import {
  generateRoundCards,
  mergeKeptActionsForHoleReroll,
  pickCards,
  pickTieredChallengeDraw,
} from "./cardEngine";

const ALL_STATUSES_OPEN = ["waiting", "active"];

function nowIso() {
  return new Date().toISOString();
}

function playerCardsId(gameId: string, playerId: string) {
  return `${gameId}_${playerId}`;
}

function randomUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Remote DB may not have applied `20260509180000_challenge_verifications_deputy.sql` yet. */
function isChallengeVerificationDeputyColumnError(error: {
  code?: string;
  message?: string;
}): boolean {
  const m = String(error.message ?? "").toLowerCase();
  return m.includes("deputy_id") || m.includes("deputy_name");
}

/** Unique topic name — `supabase.channel(name)` is a singleton; extra `.on()` after `subscribe()` throws. Avoid `:` (some clients normalize topics). */
function channelTopic(prefix: string): string {
  return `${prefix}_sub_${randomUuid()}`;
}

function generateLobbyCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += chars[Math.floor(Math.random() * chars.length)]!;
  }
  return out;
}

/** Everyone begins the round with this balance (games created via `createGame`). */
function initialPlayerPoints(
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

export class DatabaseService {
  /** Rerolls no longer cost balance (UI historically referenced this). */
  static rerollHandCostPoints = 0;
  /** One free manual reroll per hole per tab (challenges vs market); resets on hole advance. */
  static rerollHandMaxUses = 1;

  async addPlayer(input: { name: string; email: string; handicap?: number }) {
    await supabase.from("players").insert({
      name: input.name,
      email: input.email,
      handicap: input.handicap ?? 0,
      created_at: nowIso(),
    });
  }

  subscribePlayers(onNext: (rows: Record<string, unknown>[]) => void): () => void {
    const load = async () => {
      const { data } = await supabase.from("players").select("*").order("name");
      onNext(data ?? []);
    };
    void load();
    const ch = supabase
      .channel(channelTopic("players-all"))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players" },
        () => void load(),
      )
      .subscribe();
    return () => void supabase.removeChannel(ch);
  }

  async updatePlayer(playerId: string, data: Record<string, unknown>) {
    await supabase.from("players").update(data).eq("id", playerId);
  }

  async deletePlayer(playerId: string) {
    await supabase.from("players").delete().eq("id", playerId);
  }

  async addScore(input: {
    playerId: string;
    playerName: string;
    hole: number;
    strokes: number;
    gameId?: string;
  }) {
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

  subscribeScores(
    gameId: string | undefined,
    onNext: (rows: Record<string, unknown>[]) => void,
  ): () => void {
    const load = async () => {
      let q = supabase.from("scores").select("*").order("hole");
      if (gameId) q = q.eq("game_id", gameId);
      const { data } = await q;
      onNext(data ?? []);
    };
    void load();
    const ch = supabase
      .channel(channelTopic(`scores-${gameId ?? "all"}`))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scores" },
        () => void load(),
      )
      .subscribe();
    return () => void supabase.removeChannel(ch);
  }

  async updateScore(scoreId: string, newStrokes: number) {
    const { error } = await supabase
      .from("scores")
      .update({ strokes: newStrokes, updated_at: nowIso() })
      .eq("id", scoreId);
    if (error) throw error;
  }

  async deleteScore(scoreId: string) {
    await supabase.from("scores").delete().eq("id", scoreId);
  }

  /** Insert or update strokes for this player on this hole (one row per hole). */
  async saveHoleScore(input: {
    gameId: string;
    playerId: string;
    playerName: string;
    hole: number;
    strokes: number;
  }) {
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
      await this.updateScore(existing.id as string, strokes);
      return;
    }
    await this.addScore({
      playerId: input.playerId,
      playerName: input.playerName,
      hole,
      strokes,
      gameId: input.gameId,
    });
  }

  async createGame(input: {
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

  subscribeGames(onNext: (rows: Record<string, unknown>[]) => void): () => void {
    const load = async () => {
      const { data } = await supabase
        .from("games")
        .select("*")
        .order("created_at", { ascending: false });
      onNext(data ?? []);
    };
    void load();
    const ch = supabase
      .channel(channelTopic("games-all"))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "games" },
        () => void load(),
      )
      .subscribe();
    return () => void supabase.removeChannel(ch);
  }

  async updateGameStatus(gameId: string, status: string) {
    await supabase
      .from("games")
      .update({ status, updated_at: nowIso() })
      .eq("id", gameId);
  }

  async getPlayerScoresForGame(gameId: string, playerId: string) {
    const { data } = await supabase
      .from("scores")
      .select("*")
      .eq("game_id", gameId)
      .eq("player_id", playerId)
      .order("hole");
    return (data ?? []).map((row) => ({ id: row.id, ...row }));
  }

  async getGameTotals(gameId: string): Promise<Record<string, number>> {
    const { data } = await supabase.from("scores").select("*").eq("game_id", gameId);
    const totals: Record<string, number> = {};
    for (const row of data ?? []) {
      const pid = row.player_id as string;
      totals[pid] = (totals[pid] ?? 0) + Number(row.strokes);
    }
    return totals;
  }

  async createLobby(input: {
    lobbyName: string;
    hostId: string;
    hostName: string;
    maxPlayers?: number;
  }): Promise<string> {
    let code = generateLobbyCode();
    for (let attempt = 0; attempt < 20; attempt++) {
      const { data: existing } = await supabase
        .from("lobbies")
        .select("id")
        .eq("code", code)
        .maybeSingle();
      if (!existing) break;
      code = generateLobbyCode();
    }

    const hostPlayer: LobbyPlayer = {
      id: input.hostId,
      name: input.hostName,
      joinedAt: nowIso(),
      isHost: true,
    };

    const lobby: Omit<Lobby, "id"> = {
      code,
      name: input.lobbyName,
      hostId: input.hostId,
      hostName: input.hostName,
      players: [hostPlayer],
      status: "waiting",
      maxPlayers: input.maxPlayers ?? 4,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      gameId: null,
      plannedHoles: 18,
      plannedMode: "classic",
      startingPoints: 1,
    };

    const { data, error } = await supabase
      .from("lobbies")
      .insert(lobbyToInsert(lobby))
      .select("id")
      .single();
    if (error) {
      throw new Error(
        error.message ||
          `Could not create lobby (${error.code ?? "unknown"}). If you see a missing column error, run supabase/migrations on your project.`,
      );
    }
    if (!data?.id) throw new Error("Lobby was created but no id was returned.");
    return data.id as string;
  }

  async findLobbyByCode(code: string): Promise<Lobby | null> {
    const c = code.trim().toUpperCase();
    const { data, error } = await supabase
      .from("lobbies")
      .select("*")
      .eq("code", c)
      .in("status", ALL_STATUSES_OPEN)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return lobbyFromRow(data.id as string, data as Record<string, unknown>);
  }

  async joinLobby(lobbyCode: string, playerId: string, playerName: string): Promise<boolean> {
    const lobby = await this.findLobbyByCode(lobbyCode);
    if (!lobby) return false;

    if (lobbyHelpers.isPlayerInLobby(lobby, playerId)) {
      const updated = lobby.players.map((p) =>
        p.id === playerId ? { ...p, name: playerName } : p,
      );
      await supabase
        .from("lobbies")
        .update({
          players: lobbyPlayersToJson(updated),
          updated_at: nowIso(),
        })
        .eq("id", lobby.id);
      return true;
    }
    if (lobbyHelpers.isFull(lobby)) return false;

    const newPlayer: LobbyPlayer = {
      id: playerId,
      name: playerName,
      joinedAt: nowIso(),
      isHost: false,
    };
    const updatedPlayers = [...lobby.players, newPlayer];
    await supabase
      .from("lobbies")
      .update({
        players: lobbyPlayersToJson(updatedPlayers),
        updated_at: nowIso(),
      })
      .eq("id", lobby.id);
    return true;
  }

  async leaveLobby(lobbyId: string, playerId: string) {
    const { data: row } = await supabase
      .from("lobbies")
      .select("*")
      .eq("id", lobbyId)
      .maybeSingle();
    if (!row) return;

    const lobby = lobbyFromRow(lobbyId, row as Record<string, unknown>);
    let players = lobby.players.filter((p) => p.id !== playerId);
    if (players.length === 0) {
      await this.closeLobby(lobbyId);
      return;
    }
    if (lobby.hostId === playerId && players.length > 0) {
      players = players.map((p, i) => (i === 0 ? { ...p, isHost: true } : p));
      await supabase
        .from("lobbies")
        .update({
          host_id: players[0]!.id,
          host_name: players[0]!.name,
          players: lobbyPlayersToJson(players),
          updated_at: nowIso(),
        })
        .eq("id", lobbyId);
      return;
    }
    await supabase
      .from("lobbies")
      .update({
        players: lobbyPlayersToJson(players),
        updated_at: nowIso(),
      })
      .eq("id", lobbyId);
  }

  /** Remove another player from the lobby. Only the current host may call this. */
  async kickPlayerFromLobby(
    lobbyId: string,
    hostPlayerId: string,
    targetPlayerId: string,
  ) {
    if (hostPlayerId === targetPlayerId) {
      throw new Error("Use leave lobby to exit yourself");
    }
    const { data: row } = await supabase
      .from("lobbies")
      .select("*")
      .eq("id", lobbyId)
      .maybeSingle();
    if (!row) throw new Error("Lobby not found");
    const lobby = lobbyFromRow(lobbyId, row as Record<string, unknown>);
    if (lobby.hostId !== hostPlayerId) {
      throw new Error("Only the host can remove players");
    }
    if (!lobbyHelpers.isPlayerInLobby(lobby, targetPlayerId)) {
      throw new Error("Player is not in this lobby");
    }
    if (lobby.hostId === targetPlayerId) {
      throw new Error("Cannot remove the host");
    }
    if (!lobbyHelpers.isWaiting(lobby)) {
      throw new Error("Players can only be removed while the lobby is waiting");
    }
    const players = lobby.players.filter((p) => p.id !== targetPlayerId);
    await supabase
      .from("lobbies")
      .update({
        players: lobbyPlayersToJson(players),
        updated_at: nowIso(),
      })
      .eq("id", lobbyId);
  }

  subscribeLobby(lobbyId: string, onNext: (lobby: Lobby | null) => void): () => void {
    const load = async () => {
      const { data } = await supabase
        .from("lobbies")
        .select("*")
        .eq("id", lobbyId)
        .maybeSingle();
      onNext(data ? lobbyFromRow(lobbyId, data as Record<string, unknown>) : null);
    };
    void load();
    const ch = supabase
      .channel(channelTopic(`lobby-row-${lobbyId}`))
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lobbies",
          filter: `id=eq.${lobbyId}`,
        },
        () => void load(),
      )
      .subscribe();
    return () => void supabase.removeChannel(ch);
  }

  async getLobbyById(lobbyId: string): Promise<Lobby | null> {
    const { data } = await supabase
      .from("lobbies")
      .select("*")
      .eq("id", lobbyId)
      .maybeSingle();
    if (!data) return null;
    return lobbyFromRow(lobbyId, data as Record<string, unknown>);
  }

  async updateLobbyPlannedSettings(
    lobbyId: string,
    input: { holes: number; mode: GameMode; startingPoints?: number },
  ) {
    const h = Math.max(1, Math.floor(input.holes));
    const sp =
      input.startingPoints !== undefined
        ? Math.min(10, Math.max(0, Math.floor(input.startingPoints)))
        : undefined;
    const now = nowIso();
    const { error } = await supabase
      .from("lobbies")
      .update({
        planned_holes: h,
        planned_mode: gameModeValue(input.mode),
        updated_at: now,
      })
      .eq("id", lobbyId);
    if (error) throw error;
    if (sp !== undefined) {
      const r = await supabase
        .from("lobbies")
        .update({ starting_points: sp, updated_at: nowIso() })
        .eq("id", lobbyId);
      if (r.error) {
        console.warn(
          "[lobbies] starting_points not updated (run DB migration if you use starting gold):",
          r.error.message,
        );
      }
    }
  }

  async updateLobbyStatus(lobbyId: string, status: string) {
    await supabase
      .from("lobbies")
      .update({ status, updated_at: nowIso() })
      .eq("id", lobbyId);
  }

  async closeLobby(lobbyId: string) {
    await this.updateLobbyStatus(lobbyId, "closed");
  }

  async startGameFromLobby(lobbyId: string): Promise<string> {
    const lobby = await this.getLobbyById(lobbyId);
    if (!lobby) throw new Error("Lobby not found");

    const playerIds = lobby.players.map((p) => p.id);
    const resolvedHoles = Math.max(1, Math.floor(lobby.plannedHoles));
    const resolvedMode = lobby.plannedMode;
    const resolvedStarting = Math.min(
      10,
      Math.max(0, Math.floor(lobby.startingPoints)),
    );

    const gameId = await this.createGame({
      gameName: lobby.name,
      playerIds,
      holes: resolvedHoles,
      mode: resolvedMode,
      startingPointsPerPlayer: resolvedStarting,
    });

    await supabase
      .from("games")
      .update({ current_hole: 1, updated_at: nowIso() })
      .eq("id", gameId);

    await supabase
      .from("lobbies")
      .update({
        status: "active",
        game_id: gameId,
        updated_at: nowIso(),
      })
      .eq("id", lobbyId);

    await this.distributePlayerCards(gameId, playerIds);
    return gameId;
  }

  async distributePlayerCards(
    gameId: string,
    playerIds: string[],
    opts?: { cancelChallengePendingHole?: number },
  ) {
    if (opts?.cancelChallengePendingHole != null) {
      for (const pid of playerIds) {
        await this.cancelPendingChallengeVerificationsForPlayerHole(
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
        const existingCards = (existingRow.cards as Record<string, unknown>[]) ?? [];
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
        cards: playerCardsJson,
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
        passive_effects: passiveEffectsAccum,
        hole: currentHole,
        updated_at: nowIso(),
      })
      .eq("game_id", gameId);
  }

  private async mergeGamePoints(
    gameId: string,
    merge: (prev: Record<string, number>) => Record<string, number>,
  ) {
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

  /** Random 1–5 pts transfer from target to thief, capped by target balance. */
  private async stealRandomPointsBetweenPlayers(input: {
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
    await this.mergeGamePoints(input.gameId, (prev) => ({
      ...prev,
      [input.targetId]: (prev[input.targetId] ?? 0) - take,
      [input.thiefId]: (prev[input.thiefId] ?? 0) + take,
    }));
    return { ok: true, amount: take };
  }

  async cancelPendingChallengeVerificationsForPlayerHole(
    gameId: string,
    claimantId: string,
    hole: number,
  ) {
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

  async markChallengeClaimed(input: {
    gameId: string;
    playerId: string;
    cardId: string;
    cardHole: number;
  }) {
    const pcId = playerCardsId(input.gameId, input.playerId);
    const { data: row } = await supabase.from("player_cards").select("*").eq("id", pcId).single();
    if (!row) throw new Error("Player cards not found");
    const cards = [...((row.cards as Record<string, unknown>[]) ?? [])];
    const idx = cards.findIndex((c) => {
      if (!isChallengeCardType(String(c.type))) return false;
      if (String(c.id) !== input.cardId) return false;
      return Number(c.hole) === input.cardHole;
    });
    if (idx < 0) throw new Error("Challenge not found");
    if (cards[idx]!.claimed === true) throw new Error("Challenge already claimed");
    if (cards[idx]!.verificationPending === true) {
      throw new Error("Challenge is awaiting verification");
    }
    cards[idx] = { ...cards[idx]!, claimed: true };
    await supabase
      .from("player_cards")
      .update({ cards, updated_at: nowIso() })
      .eq("id", pcId);
  }

  subscribeChallengeVerifications(
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
        },
        () => void load(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(ch);
    };
  }

  /** Cheap count for tab badge: pending rows **you can resolve** (not your own request). */
  async fetchPendingChallengeVerificationCount(
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

  async assignTrialCombatDeputy(input: {
    gameId: string;
    sponsorId: string;
    deputyId: string;
    deputyName: string;
    challengeCardId: string;
    cardHole: number;
  }) {
    if (input.deputyId === input.sponsorId) {
      throw new Error("You cannot assign yourself as fighter");
    }
    const pcId = playerCardsId(input.gameId, input.sponsorId);
    const { data: row } = await supabase.from("player_cards").select("*").eq("id", pcId).single();
    if (!row) throw new Error("Player cards not found");
    const cards = [...((row.cards as Record<string, unknown>[]) ?? [])];
    const idx = cards.findIndex((c) => {
      if (!isChallengeCardType(String(c.type))) return false;
      if (String(c.id) !== input.challengeCardId) return false;
      return Number(c.hole) === input.cardHole;
    });
    if (idx < 0) throw new Error("Challenge not found");
    if (cards[idx]!.claimed === true) throw new Error("Challenge already claimed");
    if (cards[idx]!.verificationPending === true) {
      throw new Error("Challenge is already awaiting verification");
    }
    cards[idx] = {
      ...cards[idx]!,
      trialCombatDeputyId: input.deputyId,
      trialCombatDeputyName: input.deputyName,
    };
    await supabase
      .from("player_cards")
      .update({ cards, updated_at: nowIso() })
      .eq("id", pcId);
  }

  async requestChallengeVerification(input: {
    gameId: string;
    claimantId: string;
    claimantName: string;
    cardId: string;
    cardHole: number;
    pointsToAward: number;
    cardSummary: Record<string, unknown>;
  }): Promise<string> {
    const verificationId = randomUuid();
    const pcId = playerCardsId(input.gameId, input.claimantId);
    const { data: row } = await supabase.from("player_cards").select("*").eq("id", pcId).single();
    if (!row) throw new Error("Player cards not found");
    const cards = [...((row.cards as Record<string, unknown>[]) ?? [])];
    const idx = cards.findIndex((c) => {
      if (!isChallengeCardType(String(c.type))) return false;
      if (String(c.id) !== input.cardId) return false;
      return Number(c.hole) === input.cardHole;
    });
    if (idx < 0) throw new Error("Challenge not found");
    if (cards[idx]!.claimed === true) throw new Error("Challenge already claimed");
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

    let insertPayload: Record<string, unknown> = { ...insertBase };
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
    await this.addGameEvent({
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
        ...(deputyId != null
          ? { deputyId, deputyName: deputyName ?? "" }
          : {}),
      },
    });
    return verificationId;
  }

  async confirmChallengeVerification(input: {
    gameId: string;
    verificationId: string;
    verifierId: string;
    verifierName: string;
  }) {
    await this.applyChallengeVerificationOutcome({
      ...input,
      outcome: "succeeded",
    });
  }

  /** Marks verification failed: no points; challenge card is consumed (`claimed`). */
  async failChallengeVerification(input: {
    gameId: string;
    verificationId: string;
    verifierId: string;
    verifierName: string;
  }) {
    await this.applyChallengeVerificationOutcome({
      ...input,
      outcome: "failed",
    });
  }

  private async applyChallengeVerificationOutcome(input: {
    gameId: string;
    verificationId: string;
    verifierId: string;
    verifierName: string;
    outcome: "succeeded" | "failed";
  }) {
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
    const { data: pcRow } = await supabase.from("player_cards").select("*").eq("id", pcId).single();
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
      await this.mergeGamePoints(input.gameId, (pp) => {
        const next = { ...pp };
        next[claimantId] = (next[claimantId] ?? 0) + pointsToAward;
        if (hasDeputy) {
          next[deputyId] = (next[deputyId] ?? 0) + pointsToAward;
        }
        return next;
      });
    }

    if (!succeeded && hasDeputy) {
      await this.mergeGamePoints(input.gameId, (pp) => ({
        ...pp,
        [claimantId]: Math.max(0, (pp[claimantId] ?? 0) - 1),
      }));
    }

    await supabase
      .from("player_cards")
      .update({ cards, updated_at: nowIso() })
      .eq("id", pcId);

    if (succeeded) {
      await this.addGameEvent({
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
      await this.addGameEvent({
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
      await this.addGameEvent({
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

    await this.maybeFreeChallengeRerollAfterVerification(input.gameId, claimantId);
  }

  private async maybeFreeChallengeRerollAfterVerification(gameId: string, claimantId: string) {
    const { data: g } = await supabase.from("games").select("*").eq("id", gameId).single();
    if (!g) return;
    const hole = Number(g.current_hole ?? 1);
    const pcId = playerCardsId(gameId, claimantId);
    const { data: pc } = await supabase.from("player_cards").select("*").eq("id", pcId).maybeSingle();
    if (!pc) return;
    const cards = (pc.cards as Record<string, unknown>[]) ?? [];
    const forHole = cards.filter(
      (c) =>
        isChallengeCardType(String(c.type)) && Number(c.hole ?? hole) === hole,
    );
    if (forHole.length !== 3) return;
    if (!forHole.every((c) => c.claimed === true)) return;
    try {
      await this.rerollPlayerChallenges(gameId, claimantId, {
        free: true,
        hideNextChallengeDrawPopup: true,
      });
    } catch {
      /* ignore */
    }
  }

  async markHoleActionConsumed(input: {
    gameId: string;
    playerId: string;
    cardId: string;
    cardHole: number;
  }) {
    const { data: g } = await supabase.from("games").select("*").eq("id", input.gameId).single();
    if (!g) throw new Error("Game not found");
    const cur = Number(g.current_hole ?? 1);
    if (input.cardHole !== cur) throw new Error("That action is not part of this hole's offers");

    const pcId = playerCardsId(input.gameId, input.playerId);
    const { data: pcRow } = await supabase.from("player_cards").select("*").eq("id", pcId).single();
    if (!pcRow) throw new Error("Player cards not found");
    const cards = [...((pcRow.cards as Record<string, unknown>[]) ?? [])];
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
    await supabase
      .from("player_cards")
      .update({ cards, updated_at: nowIso() })
      .eq("id", pcId);
  }

  async deleteBankedActionCard(input: {
    gameId: string;
    playerId: string;
    cardId: string;
    cardHole: number;
  }) {
    const pcId = playerCardsId(input.gameId, input.playerId);
    const { data: pcRow } = await supabase.from("player_cards").select("*").eq("id", pcId).single();
    if (!pcRow) throw new Error("Player cards not found");
    let cards = [...((pcRow.cards as Record<string, unknown>[]) ?? [])];
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
    await supabase
      .from("player_cards")
      .update({ cards, updated_at: nowIso() })
      .eq("id", pcId);
  }

  async deletePendingBankedActionCard(input: {
    gameId: string;
    playerId: string;
    cardId: string;
    cardHole: number;
  }) {
    const pcId = playerCardsId(input.gameId, input.playerId);
    const { data: pcRow } = await supabase.from("player_cards").select("*").eq("id", pcId).single();
    if (!pcRow) throw new Error("Player cards not found");
    let cards = [...((pcRow.cards as Record<string, unknown>[]) ?? [])];
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
    await supabase
      .from("player_cards")
      .update({ cards, updated_at: nowIso() })
      .eq("id", pcId);
  }

  async markPendingBankedActionUsed(input: {
    gameId: string;
    playerId: string;
    cardId: string;
    cardHole: number;
  }) {
    const pcId = playerCardsId(input.gameId, input.playerId);
    const [{ data: pcRow }, { data: gameDoc }] = await Promise.all([
      supabase.from("player_cards").select("*").eq("id", pcId).single(),
      supabase.from("games").select("current_hole").eq("id", input.gameId).single(),
    ]);
    if (!pcRow) throw new Error("Player cards not found");
    if (!gameDoc) throw new Error("Game not found");
    const curHole = Number(gameDoc.current_hole ?? 1);

    const cards = [...((pcRow.cards as Record<string, unknown>[]) ?? [])];
    // Prefer bag-saved copies (banked) so playing inventory never touches an unrelated
    // market row that shares the same card id + pendingBank (e.g. just purchased).
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
    const playedHole = played.hole != null ? Number(played.hole) : input.cardHole;

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
      if (pool.length > 0) {
        cards[idx] = pool[0]!;
      } else {
        cards[idx] = { ...played, inventoryUsed: true };
      }
    } else {
      cards[idx] = { ...played, inventoryUsed: true };
    }

    await supabase
      .from("player_cards")
      .update({ cards, updated_at: nowIso() })
      .eq("id", pcId);
  }

  async removeActionCardByIdHole(input: {
    gameId: string;
    playerId: string;
    cardId: string;
    cardHole: number;
  }) {
    const pcId = playerCardsId(input.gameId, input.playerId);
    const { data: pcRow } = await supabase.from("player_cards").select("*").eq("id", pcId).single();
    if (!pcRow) throw new Error("Player cards not found");
    const cards = [...((pcRow.cards as Record<string, unknown>[]) ?? [])];
    const idx = cards.findIndex((c) => {
      if (c.type !== "action") return false;
      if (String(c.id) !== input.cardId) return false;
      const h = c.hole != null ? Number(c.hole) : null;
      return h === null || h === input.cardHole;
    });
    if (idx < 0) throw new Error("Action card not found");
    cards.splice(idx, 1);
    await supabase
      .from("player_cards")
      .update({ cards, updated_at: nowIso() })
      .eq("id", pcId);
  }

  subscribePlayerCards(
    gameId: string,
    playerId: string,
    onNext: (doc: Record<string, unknown> | null) => void,
  ): () => void {
    const id = playerCardsId(gameId, playerId);
    const load = async () => {
      const { data } = await supabase.from("player_cards").select("*").eq("id", id).maybeSingle();
      onNext(data as Record<string, unknown> | null);
    };
    void load();
    const ch = supabase
      .channel(channelTopic(`pc-${id}`))
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "player_cards",
          filter: `id=eq.${id}`,
        },
        () => void load(),
      )
      .subscribe();
    return () => void supabase.removeChannel(ch);
  }

  async clearHideNextChallengeDrawPopup(gameId: string, playerId: string) {
    const pcId = playerCardsId(gameId, playerId);
    await supabase
      .from("player_cards")
      .update({ hide_next_challenge_draw_popup: null, updated_at: nowIso() })
      .eq("id", pcId);
  }

  subscribeAllPlayerCards(
    gameId: string,
    onNext: (docs: Record<string, unknown>[]) => void,
  ): () => void {
    const load = async () => {
      const { data } = await supabase
        .from("player_cards")
        .select("*")
        .eq("game_id", gameId);
      onNext(data ?? []);
    };
    void load();
    const ch = supabase
      .channel(channelTopic(`pc-game-${gameId}`))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "player_cards" },
        () => void load(),
      )
      .subscribe();
    return () => void supabase.removeChannel(ch);
  }

  async addGameEvent(input: {
    gameId: string;
    playerId: string;
    playerName: string;
    eventType: string;
    eventData: Record<string, unknown>;
  }) {
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

  subscribeGameEvents(
    gameId: string,
    onNext: (rows: Record<string, unknown>[]) => void,
  ): () => void {
    const load = async () => {
      const { data, error } = await supabase
        .from("game_events")
        .select("*")
        .eq("game_id", gameId)
        .order("timestamp", { ascending: false })
        .limit(50);
      if (error) {
        console.warn("[subscribeGameEvents]", gameId, error.message);
        return;
      }
      onNext(data ?? []);
    };
    void load();
    const ch = supabase
      .channel(channelTopic(`ev-${gameId}`))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_events" },
        () => void load(),
      )
      .subscribe();
    /** If Realtime is off or `game_events` is not in the publication, polling still picks up new rows. */
    const poll = setInterval(() => void load(), 5000);
    return () => {
      clearInterval(poll);
      void supabase.removeChannel(ch);
    };
  }

  /** One-shot fetch — use instead of subscribeGame when realtime isn’t needed (e.g. end-game summary). */
  async fetchGameById(gameId: string): Promise<Record<string, unknown> | null> {
    const { data, error } = await supabase
      .from("games")
      .select("*")
      .eq("id", gameId)
      .maybeSingle();
    if (error) throw error;
    return data as Record<string, unknown> | null;
  }

  subscribeGame(gameId: string, onNext: (row: Record<string, unknown> | null) => void): () => void {
    const load = async () => {
      const { data } = await supabase.from("games").select("*").eq("id", gameId).maybeSingle();
      onNext(data as Record<string, unknown> | null);
    };
    void load();
    const ch = supabase
      .channel(channelTopic(`game-${gameId}`))
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "games",
          filter: `id=eq.${gameId}`,
        },
        () => void load(),
      )
      .subscribe();
    return () => void supabase.removeChannel(ch);
  }

  subscribeGlobalEffects(
    gameId: string,
    onNext: (row: Record<string, unknown> | null) => void,
  ): () => void {
    const load = async () => {
      const { data } = await supabase
        .from("global_effects")
        .select("*")
        .eq("game_id", gameId)
        .maybeSingle();
      onNext(data as Record<string, unknown> | null);
    };
    void load();
    const ch = supabase
      .channel(channelTopic(`ge-${gameId}`))
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "global_effects",
          filter: `game_id=eq.${gameId}`,
        },
        () => void load(),
      )
      .subscribe();
    return () => void supabase.removeChannel(ch);
  }

  async nextHole(gameId: string, playerIds: string[]) {
    const { data: gameDoc } = await supabase.from("games").select("*").eq("id", gameId).single();
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
    await this.distributePlayerCards(gameId, playerIds, {
      cancelChallengePendingHole: currentHole,
    });
    await this.addGameEvent({
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

  async awardPoints(gameId: string, playerId: string, points: number) {
    await this.mergeGamePoints(gameId, (pp) => ({
      ...pp,
      [playerId]: (pp[playerId] ?? 0) + points,
    }));
  }

  async deductPoints(gameId: string, playerId: string, points: number) {
    if (points <= 0) return;
    await this.mergeGamePoints(gameId, (pp) => ({
      ...pp,
      [playerId]: (pp[playerId] ?? 0) - points,
    }));
  }

  async setPlayerBalanceHiddenForCurrentHole(input: {
    gameId: string;
    playerId: string;
  }) {
    const { data: g } = await supabase.from("games").select("*").eq("id", input.gameId).single();
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

  async rerollPlayerChallenges(
    gameId: string,
    playerId: string,
    opts?: { free?: boolean; hideNextChallengeDrawPopup?: boolean },
  ) {
    const free = opts?.free ?? false;
    const { data: gameDoc } = await supabase.from("games").select("*").eq("id", gameId).single();
    if (!gameDoc) throw new Error("Game not found");
    const currentHole = Number(gameDoc.current_hole ?? 1);

    const pcId = playerCardsId(gameId, playerId);
    const { data: pcRow } = await supabase.from("player_cards").select("*").eq("id", pcId).single();
    if (!pcRow) throw new Error("Player cards not found");
    const rerollsUsed = Number(pcRow.challenge_rerolls_used ?? 0);
    const cards = [...((pcRow.cards as Record<string, unknown>[]) ?? [])];
    const challenges = cards.filter((c) => isChallengeCardType(String(c.type)));
    const actions = cards.filter((c) => c.type === "action");

    if (!free && rerollsUsed >= DatabaseService.rerollHandMaxUses) {
      throw new Error("Challenge reroll limit reached");
    }
    if (!free && challenges.length === 0) {
      throw new Error("No challenges to reroll");
    }

    const newChallenges = pickTieredChallengeDraw(playerId, currentHole);
    const newCards = [...newChallenges, ...actions];

    const update: Record<string, unknown> = {
      cards: newCards,
      challenge_rerolls_used: free ? rerollsUsed : rerollsUsed + 1,
      updated_at: nowIso(),
    };
    if (opts?.hideNextChallengeDrawPopup) {
      update.hide_next_challenge_draw_popup = true;
    }
    await supabase.from("player_cards").update(update).eq("id", pcId);

    const { data: geRow } = await supabase
      .from("global_effects")
      .select("*")
      .eq("game_id", gameId)
      .maybeSingle();
    const passive = [
      ...(((geRow?.passive_effects as Record<string, unknown>[]) ?? []).filter(
        (e) => e.playerId !== playerId,
      )),
      ...newChallenges.map((c) => ({
        ...c,
        playerId,
        hole: currentHole,
      })),
    ];
    await supabase
      .from("global_effects")
      .upsert({
        game_id: gameId,
        passive_effects: passive,
        hole: currentHole,
        updated_at: nowIso(),
      });

    await this.cancelPendingChallengeVerificationsForPlayerHole(
      gameId,
      playerId,
      currentHole,
    );
  }

  async rerollPlayerActions(
    gameId: string,
    playerId: string,
    opts?: { free?: boolean; hideNextChallengeDrawPopup?: boolean },
  ) {
    const { data: gameDoc } = await supabase.from("games").select("*").eq("id", gameId).single();
    if (!gameDoc) throw new Error("Game not found");
    const currentHole = Number(gameDoc.current_hole ?? 1);

    const pcId = playerCardsId(gameId, playerId);
    const { data: pcRow } = await supabase.from("player_cards").select("*").eq("id", pcId).single();
    if (!pcRow) throw new Error("Player cards not found");
    const rerollsUsed = Number(pcRow.action_rerolls_used ?? 0);
    if (rerollsUsed >= DatabaseService.rerollHandMaxUses) {
      throw new Error("Action reroll limit reached");
    }

    const cards = [...((pcRow.cards as Record<string, unknown>[]) ?? [])];
    const challenges = cards.filter((c) => isChallengeCardType(String(c.type)));
    const actions = cards.filter((c) => c.type === "action");
    if (actions.length === 0) throw new Error("No actions to reroll");

    const keptActions = mergeKeptActionsForHoleReroll(actions, currentHole);
    const excludeIds = new Set(keptActions.map((c) => String(c.id)).filter(Boolean));
    const newActions = pickCards("action", {
      count: 3,
      playerId,
      hole: currentHole,
      excludeCardIds: excludeIds,
    });
    const newCards = [...challenges, ...keptActions, ...newActions];

    const update: Record<string, unknown> = {
      cards: newCards,
      action_rerolls_used: rerollsUsed + 1,
      updated_at: nowIso(),
    };
    if (opts?.hideNextChallengeDrawPopup) {
      update.hide_next_challenge_draw_popup = true;
    }
    await supabase.from("player_cards").update(update).eq("id", pcId);
  }

  async bankHoleOfferAction(input: {
    gameId: string;
    playerId: string;
    cardId: string;
    cardHole: number;
  }) {
    const { data: gameDoc } = await supabase.from("games").select("*").eq("id", input.gameId).single();
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
    const { data: pcRow } = await supabase.from("player_cards").select("*").eq("id", pcId).single();
    if (!pcRow) throw new Error("Player cards not found");
    const cards = [...((pcRow.cards as Record<string, unknown>[]) ?? [])];
    const idx = cards.findIndex((c) => {
      if (c.type !== "action") return false;
      if (c.banked === true) return false;
      if (c.pendingBank === true) return false;
      if (c.offerConsumed === true) return false;
      if (String(c.id) !== input.cardId) return false;
      return Number(c.hole) === input.cardHole;
    });
    if (idx < 0) throw new Error("Action offer not found or already saved");

    const buyCost = Math.min(
      9999,
      Math.max(0, Number((cards[idx]!.points as number) ?? 1)),
    );
    const pp = (gameDoc.player_points as Record<string, number>) ?? {};
    const balance = pp[input.playerId] ?? 0;
    if (balance < buyCost) {
      throw new Error(`Need at least ${buyCost} points to save an action`);
    }

    cards[idx] = {
      ...cards[idx]!,
      offerConsumed: true,
      pendingBank: true,
    };

    if (buyCost > 0) {
      await this.deductPoints(input.gameId, input.playerId, buyCost);
    }
    await supabase
      .from("player_cards")
      .update({ cards, updated_at: nowIso() })
      .eq("id", pcId);
  }

  private isPlayableActionCandidate(c: Record<string, unknown>): boolean {
    if (c.type !== "action") return false;
    if (c.inventoryUsed === true) return false;
    const banked = c.banked === true;
    const pending = c.pendingBank === true;
    const consumed = c.offerConsumed === true;
    if (consumed && !banked && !pending) return false;
    return true;
  }

  async stealRandomActionCardFromPlayer(input: {
    gameId: string;
    thiefPlayerId: string;
    targetPlayerId: string;
  }): Promise<
    | { ok: true; card: Record<string, unknown> }
    | { ok: false; reason: "no_cards" }
  > {
    const thiefRef = playerCardsId(input.gameId, input.thiefPlayerId);
    const targetRef = playerCardsId(input.gameId, input.targetPlayerId);
    const { data: thiefRow } = await supabase.from("player_cards").select("*").eq("id", thiefRef).single();
    const { data: targetRow } = await supabase.from("player_cards").select("*").eq("id", targetRef).single();
    if (!thiefRow || !targetRow) throw new Error("Player cards not found");

    const thiefCards = [...((thiefRow.cards as Record<string, unknown>[]) ?? [])];
    const targetCards = [...((targetRow.cards as Record<string, unknown>[]) ?? [])];
    const candidateIndexes: number[] = [];
    for (let i = 0; i < targetCards.length; i++) {
      if (this.isPlayableActionCandidate(targetCards[i]!)) candidateIndexes.push(i);
    }
    if (candidateIndexes.length === 0) {
      return { ok: false, reason: "no_cards" };
    }
    const removeIdx =
      candidateIndexes[Math.floor(Math.random() * candidateIndexes.length)]!;
    const removed = { ...targetCards.splice(removeIdx, 1)[0]! };
    removed.banked = true;
    delete removed.pendingBank;
    delete removed.inventoryUsed;
    delete removed.offerConsumed;
    thiefCards.push(removed);

    await supabase
      .from("player_cards")
      .update({ cards: targetCards, updated_at: nowIso() })
      .eq("id", targetRef);
    await supabase
      .from("player_cards")
      .update({ cards: thiefCards, updated_at: nowIso() })
      .eq("id", thiefRef);
    return { ok: true, card: removed };
  }

  async destroyRandomActionCardFromPlayer(input: {
    gameId: string;
    targetPlayerId: string;
  }): Promise<
    | { ok: true; card: Record<string, unknown> }
    | { ok: false; reason: "no_cards" }
  > {
    const targetRef = playerCardsId(input.gameId, input.targetPlayerId);
    const { data: targetRow } = await supabase.from("player_cards").select("*").eq("id", targetRef).single();
    if (!targetRow) throw new Error("Player cards not found");
    const targetCards = [...((targetRow.cards as Record<string, unknown>[]) ?? [])];
    const candidateIndexes: number[] = [];
    for (let i = 0; i < targetCards.length; i++) {
      if (this.isPlayableActionCandidate(targetCards[i]!)) candidateIndexes.push(i);
    }
    if (candidateIndexes.length === 0) {
      return { ok: false, reason: "no_cards" };
    }
    const removeIdx =
      candidateIndexes[Math.floor(Math.random() * candidateIndexes.length)]!;
    const destroyed = { ...targetCards.splice(removeIdx, 1)[0]! };
    await supabase
      .from("player_cards")
      .update({ cards: targetCards, updated_at: nowIso() })
      .eq("id", targetRef);
    return { ok: true, card: destroyed };
  }

  async lockActionBuyingForCurrentHole(input: {
    gameId: string;
    targetPlayerId: string;
  }) {
    const { data: g } = await supabase.from("games").select("*").eq("id", input.gameId).single();
    if (!g) throw new Error("Game not found");
    const currentHole = Number(g.current_hole ?? 1);
    const raw = (g.action_buy_locked_until_hole as Record<string, number>) ?? {};
    await supabase
      .from("games")
      .update({
        action_buy_locked_until_hole: { ...raw, [input.targetPlayerId]: currentHole },
        updated_at: nowIso(),
      })
      .eq("id", input.gameId);
  }

  async armActionStealForPlayer(input: { gameId: string; playerId: string }) {
    const { data: g } = await supabase.from("games").select("*").eq("id", input.gameId).single();
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

  /** Resolve attack effects after the card is marked used (inventory). */
  async resolvePlayedAttackCard(input: {
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
        const r = await this.stealRandomActionCardFromPlayer({
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
        const r = await this.destroyRandomActionCardFromPlayer({
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
        await this.lockActionBuyingForCurrentHole({
          gameId: input.gameId,
          targetPlayerId: input.targetPlayerId,
        });
        outcome = { kind: "market_locked" };
        break;
      case "action_025": {
        const r = await this.stealRandomPointsBetweenPlayers({
          gameId: input.gameId,
          thiefId: input.attackerId,
          targetId: input.targetPlayerId,
        });
        if (!r.ok) outcome = { kind: "no_points_to_steal" };
        else outcome = { kind: "stole_points", amount: r.amount };
        break;
      }
      case "action_030":
        await this.armActionStealForPlayer({
          gameId: input.gameId,
          playerId: input.attackerId,
        });
        outcome = { kind: "action_steal_armed" };
        break;
      default:
        outcome = { kind: "tabletop", cardTitle };
    }

    await this.addGameEvent({
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

  async resolveActionStealCopiesForPlayedAction(input: {
    gameId: string;
    sourcePlayerId: string;
    sourceActionCard: Record<string, unknown>;
  }) {
    const title = String(input.sourceActionCard.title ?? "")
      .toLowerCase()
      .trim();
    if (title === "action steal") return;
    if (input.sourceActionCard.type !== "action") return;

    const { data: gameDoc } = await supabase.from("games").select("*").eq("id", input.gameId).single();
    if (!gameDoc) return;
    const armedRaw = (gameDoc.action_steal_armed as Record<string, boolean>) ?? {};
    const armedPlayers = Object.entries(armedRaw)
      .filter(([, v]) => v === true)
      .map(([k]) => k);
    if (armedPlayers.length === 0) return;

    const now = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    for (const playerId of armedPlayers) {
      const pcId = playerCardsId(input.gameId, playerId);
      const { data: pcRow } = await supabase.from("player_cards").select("*").eq("id", pcId).maybeSingle();
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
        .update({ cards, updated_at: nowIso() })
        .eq("id", pcId);
    }

    const cleared = { ...armedRaw };
    for (const pid of armedPlayers) delete cleared[pid];
    await supabase
      .from("games")
      .update({ action_steal_armed: cleared, updated_at: nowIso() })
      .eq("id", input.gameId);
  }

  async cleanupOldLobbies() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("lobbies").delete().lt("created_at", cutoff);
  }

  async resolvePassiveEffect(
    gameId: string,
    playerId: string,
    passiveEffect: Record<string, unknown> & {
      wheelResult?: unknown;
      playerName?: string;
    },
  ) {
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

    await this.addGameEvent({
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
}

export const databaseService = new DatabaseService();
