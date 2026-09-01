import { useEffect, useState } from "react";

import type { Lobby } from "@/models/lobby";
import { parseGameMode, type GameMode } from "@/models/gameMode";
import { databaseService } from "@/services/databaseService";

export type NormalizedGame = {
  currentHole: number;
  holes: number;
  mode: GameMode;
  playerPoints: Record<string, number>;
  playerIds: string[];
  status: string;
  name: string;
};

export function normalizeGame(
  row: Record<string, unknown> | null,
): NormalizedGame | null {
  if (!row) return null;
  return {
    currentHole: Number(row.current_hole ?? 1),
    holes: Number(row.holes ?? 18),
    mode: parseGameMode(row.mode),
    playerPoints: (row.player_points as Record<string, number>) ?? {},
    playerIds: (row.player_ids as string[]) ?? [],
    status: String(row.status ?? "active"),
    name: String(row.name ?? ""),
  };
}

type Args = { gameId: string; playerId: string; lobbyId: string };

/**
 * The four realtime subscriptions every in-game tab needs: the game row (as
 * {@link NormalizedGame}), the live-event feed, this player's card doc, the
 * scorecard rows, and the lobby snapshot. `setScoreRows` is exposed for
 * optimistic updates after saving a hole score.
 */
export function useGameData({ gameId, playerId, lobbyId }: Args) {
  const [game, setGame] = useState<NormalizedGame | null>(null);
  const [events, setEvents] = useState<Record<string, unknown>[]>([]);
  const [myCardsDoc, setMyCardsDoc] = useState<Record<string, unknown> | null>(
    null,
  );
  const [scoreRows, setScoreRows] = useState<Record<string, unknown>[]>([]);
  const [lobbySnap, setLobbySnap] = useState<Lobby | null>(null);

  useEffect(() => {
    if (!lobbyId) return;
    let active = true;
    const u = databaseService.subscribeLobby(lobbyId, (row) => {
      if (active) setLobbySnap(row);
    });
    return () => {
      active = false;
      u();
    };
  }, [lobbyId]);

  useEffect(() => {
    if (!gameId) return;
    let active = true;
    const u = databaseService.subscribeScores(gameId, (rows) => {
      if (active) setScoreRows(rows);
    });
    return () => {
      active = false;
      u();
    };
  }, [gameId]);

  useEffect(() => {
    if (!gameId) return;
    let active = true;
    const unsubGame = databaseService.subscribeGame(gameId, (row) => {
      if (active) setGame(normalizeGame(row));
    });
    const unsubEvents = databaseService.subscribeGameEvents(gameId, (ev) => {
      if (active) setEvents(ev);
    });
    return () => {
      active = false;
      unsubGame();
      unsubEvents();
    };
  }, [gameId]);

  useEffect(() => {
    if (!gameId || !playerId) return;
    let active = true;
    const u = databaseService.subscribePlayerCards(gameId, playerId, (doc) => {
      if (active) setMyCardsDoc(doc);
    });
    return () => {
      active = false;
      u();
    };
  }, [gameId, playerId]);

  return { game, events, myCardsDoc, scoreRows, setScoreRows, lobbySnap };
}
