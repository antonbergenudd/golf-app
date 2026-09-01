import { type GameMode, gameModeValue, parseGameMode } from "./gameMode";

export type LobbyPlayer = {
  id: string;
  name: string;
  joinedAt: string;
  isHost: boolean;
};

export type Lobby = {
  id: string;
  code: string;
  name: string;
  hostId: string;
  hostName: string;
  players: LobbyPlayer[];
  status: string;
  maxPlayers: number;
  createdAt: string;
  updatedAt?: string;
  gameId?: string | null;
  plannedHoles: number;
  plannedMode: GameMode;
  /** Points each player begins with when the game starts (0–10). */
  startingPoints: number;
};

function parseJoinedAt(raw: unknown): string {
  if (typeof raw === "string") return raw;
  return new Date().toISOString();
}

export function lobbyPlayerFromJson(data: Record<string, unknown>): LobbyPlayer {
  return {
    id: String(data.id ?? ""),
    name: String(data.name ?? ""),
    joinedAt: parseJoinedAt(data.joinedAt ?? data.joined_at),
    isHost: Boolean(data.isHost ?? data.is_host),
  };
}

export function lobbyFromRow(id: string, row: Record<string, unknown>): Lobby {
  const playersRaw = row.players;
  const players: LobbyPlayer[] = Array.isArray(playersRaw)
    ? playersRaw.map((p) => lobbyPlayerFromJson(p as Record<string, unknown>))
    : [];

  const planned = Number(row.planned_holes ?? row.plannedHoles ?? 18);
  const startPts = Number(row.starting_points ?? row.startingPoints ?? 1);

  return {
    id,
    code: String(row.code ?? ""),
    name: String(row.name ?? ""),
    hostId: String(row.host_id ?? row.hostId ?? ""),
    hostName: String(row.host_name ?? row.hostName ?? ""),
    players,
    status: String(row.status ?? "waiting"),
    maxPlayers: Number(row.max_players ?? row.maxPlayers ?? 4),
    createdAt: String(row.created_at ?? row.createdAt ?? new Date().toISOString()),
    updatedAt: row.updated_at != null ? String(row.updated_at) : undefined,
    gameId: row.game_id != null ? String(row.game_id) : (row.gameId as string | null) ?? null,
    plannedHoles: Math.max(1, planned),
    plannedMode: parseGameMode(row.planned_mode ?? row.plannedMode),
    startingPoints: Math.min(10, Math.max(0, Number.isFinite(startPts) ? startPts : 1)),
  };
}

export function lobbyPlayersToJson(players: LobbyPlayer[]): unknown[] {
  return players.map((p) => ({
    id: p.id,
    name: p.name,
    joinedAt: p.joinedAt,
    isHost: p.isHost,
  }));
}

export function lobbyToInsert(lobby: Omit<Lobby, "id">): Record<string, unknown> {
  return {
    code: lobby.code,
    name: lobby.name,
    host_id: lobby.hostId,
    host_name: lobby.hostName,
    players: lobbyPlayersToJson(lobby.players),
    status: lobby.status,
    max_players: lobby.maxPlayers,
    planned_holes: lobby.plannedHoles,
    planned_mode: gameModeValue(lobby.plannedMode),
    starting_points: lobby.startingPoints,
    created_at: lobby.createdAt,
    updated_at: lobby.updatedAt ?? new Date().toISOString(),
    ...(lobby.gameId ? { game_id: lobby.gameId } : {}),
  };
}

export const lobbyHelpers = {
  isFull: (l: Lobby) => l.players.length >= l.maxPlayers,
  isWaiting: (l: Lobby) => l.status === "waiting",
  isActive: (l: Lobby) => l.status === "active",
  isCompleted: (l: Lobby) => l.status === "completed",
  isClosed: (l: Lobby) => l.status === "closed",
  isPlayerInLobby: (l: Lobby, playerId: string) =>
    l.players.some((p) => p.id === playerId),
  getPlayer: (l: Lobby, playerId: string) =>
    l.players.find((p) => p.id === playerId),
};
