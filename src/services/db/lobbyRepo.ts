import { type GameMode, gameModeValue } from "../../models/gameMode";
import {
  type Lobby,
  lobbyFromRow,
  lobbyHelpers,
  type LobbyPlayer,
  lobbyPlayersToJson,
  lobbyToInsert,
} from "../../models/lobby";
import { supabase } from "../../lib/supabase";
import * as cardRepo from "./cardRepo";
import * as gameRepo from "./gameRepo";
import {
  ALL_STATUSES_OPEN,
  asJson,
  generateLobbyCode,
  nowIso,
  subscribeTable,
} from "./shared";
import type { TablesInsert, TablesUpdate } from "../../lib/database.types";

export async function createLobby(input: {
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
    .insert(lobbyToInsert(lobby) as TablesInsert<"lobbies">)
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

export async function findLobbyByCode(code: string): Promise<Lobby | null> {
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

export async function joinLobby(
  lobbyCode: string,
  playerId: string,
  playerName: string,
): Promise<boolean> {
  const lobby = await findLobbyByCode(lobbyCode);
  if (!lobby) return false;

  if (lobbyHelpers.isPlayerInLobby(lobby, playerId)) {
    const updated = lobby.players.map((p) =>
      p.id === playerId ? { ...p, name: playerName } : p,
    );
    await supabase
      .from("lobbies")
      .update({
        players: asJson(lobbyPlayersToJson(updated)),
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
      players: asJson(lobbyPlayersToJson(updatedPlayers)),
      updated_at: nowIso(),
    })
    .eq("id", lobby.id);
  return true;
}

export async function leaveLobby(
  lobbyId: string,
  playerId: string,
): Promise<void> {
  const { data: row } = await supabase
    .from("lobbies")
    .select("*")
    .eq("id", lobbyId)
    .maybeSingle();
  if (!row) return;

  const lobby = lobbyFromRow(lobbyId, row as Record<string, unknown>);
  let players = lobby.players.filter((p) => p.id !== playerId);
  if (players.length === 0) {
    await closeLobby(lobbyId);
    return;
  }
  if (lobby.hostId === playerId && players.length > 0) {
    players = players.map((p, i) => (i === 0 ? { ...p, isHost: true } : p));
    await supabase
      .from("lobbies")
      .update({
        host_id: players[0]!.id,
        host_name: players[0]!.name,
        players: asJson(lobbyPlayersToJson(players)),
        updated_at: nowIso(),
      })
      .eq("id", lobbyId);
    return;
  }
  await supabase
    .from("lobbies")
    .update({
      players: asJson(lobbyPlayersToJson(players)),
      updated_at: nowIso(),
    })
    .eq("id", lobbyId);
}

/** Remove another player from the lobby. Only the current host may call this. */
export async function kickPlayerFromLobby(
  lobbyId: string,
  hostPlayerId: string,
  targetPlayerId: string,
): Promise<void> {
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
      players: asJson(lobbyPlayersToJson(players)),
      updated_at: nowIso(),
    })
    .eq("id", lobbyId);
}

export function subscribeLobby(
  lobbyId: string,
  onNext: (lobby: Lobby | null) => void,
): () => void {
  return subscribeTable({
    topic: `lobby-row-${lobbyId}`,
    table: "lobbies",
    filter: `id=eq.${lobbyId}`,
    load: async () => {
      const { data } = await supabase
        .from("lobbies")
        .select("*")
        .eq("id", lobbyId)
        .maybeSingle();
      onNext(
        data ? lobbyFromRow(lobbyId, data as Record<string, unknown>) : null,
      );
    },
  });
}

export async function getLobbyById(lobbyId: string): Promise<Lobby | null> {
  const { data } = await supabase
    .from("lobbies")
    .select("*")
    .eq("id", lobbyId)
    .maybeSingle();
  if (!data) return null;
  return lobbyFromRow(lobbyId, data as Record<string, unknown>);
}

export async function updateLobbyPlannedSettings(
  lobbyId: string,
  input: { holes: number; mode: GameMode; startingPoints?: number },
): Promise<void> {
  const h = Math.max(1, Math.floor(input.holes));
  const update: TablesUpdate<"lobbies"> = {
    planned_holes: h,
    planned_mode: gameModeValue(input.mode),
    updated_at: nowIso(),
  };
  if (input.startingPoints !== undefined) {
    update.starting_points = Math.min(
      10,
      Math.max(0, Math.floor(input.startingPoints)),
    );
  }
  const { error } = await supabase
    .from("lobbies")
    .update(update)
    .eq("id", lobbyId);
  if (error) throw error;
}

export async function updateLobbyStatus(
  lobbyId: string,
  status: string,
): Promise<void> {
  await supabase
    .from("lobbies")
    .update({ status, updated_at: nowIso() })
    .eq("id", lobbyId);
}

export async function closeLobby(lobbyId: string): Promise<void> {
  await updateLobbyStatus(lobbyId, "closed");
}

export async function startGameFromLobby(lobbyId: string): Promise<string> {
  const lobby = await getLobbyById(lobbyId);
  if (!lobby) throw new Error("Lobby not found");

  const playerIds = lobby.players.map((p) => p.id);
  const resolvedHoles = Math.max(1, Math.floor(lobby.plannedHoles));
  const resolvedMode = lobby.plannedMode;
  const resolvedStarting = Math.min(
    10,
    Math.max(0, Math.floor(lobby.startingPoints)),
  );

  const gameId = await gameRepo.createGame({
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

  await cardRepo.distributePlayerCards(gameId, playerIds);
  return gameId;
}

export async function cleanupOldLobbies(): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await supabase.from("lobbies").delete().lt("created_at", cutoff);
}
