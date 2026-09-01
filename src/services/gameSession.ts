import AsyncStorage from "@react-native-async-storage/async-storage";

import { newPlayerId } from "../lib/ids";

const PREFS_KEY = "fairway_active_session_v1";
const DEVICE_PLAYER_ID_KEY = "fairway_device_player_id_v1";

export type GameSession = {
  lobbyId: string;
  lobbyCode: string;
  playerId: string;
  playerName: string;
  gameId?: string | null;
};

function toJson(session: GameSession): string {
  const o: Record<string, string> = {
    lobbyId: session.lobbyId,
    lobbyCode: session.lobbyCode,
    playerId: session.playerId,
    playerName: session.playerName,
  };
  if (session.gameId) o.gameId = session.gameId;
  return JSON.stringify(o);
}

export async function loadGameSession(): Promise<GameSession | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (!raw) return null;
    const m = JSON.parse(raw) as Record<string, unknown>;
    const lobbyId = m.lobbyId as string | undefined;
    const playerId = m.playerId as string | undefined;
    if (!lobbyId?.trim() || !playerId?.trim()) return null;
    const name = (m.playerName as string)?.trim();
    return {
      lobbyId,
      lobbyCode: (m.lobbyCode as string) ?? "",
      playerId,
      playerName: name && name.length > 0 ? name : "Player",
      gameId: (m.gameId as string) ?? null,
    };
  } catch {
    return null;
  }
}

export async function saveGameSession(session: GameSession): Promise<void> {
  await AsyncStorage.setItem(PREFS_KEY, toJson(session));
}

export async function clearGameSession(): Promise<void> {
  await AsyncStorage.removeItem(PREFS_KEY);
}

/**
 * One stable identity per install. Generated once with a CSPRNG and reused for
 * every lobby the device joins, so rejoining always maps back to the same
 * player. Falls back to a fresh (unpersisted) id if storage is unavailable.
 */
export async function getOrCreateDevicePlayerId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(DEVICE_PLAYER_ID_KEY);
    if (existing && existing.trim()) return existing;
  } catch {
    // fall through to mint a new one
  }
  const id = newPlayerId();
  try {
    await AsyncStorage.setItem(DEVICE_PLAYER_ID_KEY, id);
  } catch {
    // non-persistent id is still better than a colliding one
  }
  return id;
}

export async function loadSavedPlayerName(): Promise<string> {
  try {
    const n = await AsyncStorage.getItem("player_name");
    return n?.trim() ?? "";
  } catch {
    return "";
  }
}

export async function savePlayerName(name: string): Promise<void> {
  await AsyncStorage.setItem("player_name", name.trim());
}
