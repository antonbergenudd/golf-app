import { useEffect, useState } from "react";

import { isInventoryActionCard } from "@/models/card";
import { databaseService } from "@/services/databaseService";

/**
 * Count of action cards currently in the player’s bag (banked or pending bank).
 * Updates live via `player_cards` subscription — keep `gameId` / `playerId` in sync with tab routes.
 */
export function useGameInventoryBagCount(
  gameId: string,
  playerId: string,
): number {
  const [count, setCount] = useState(0);
  const gid = gameId.trim();
  const pid = playerId.trim();

  useEffect(() => {
    if (!gid || !pid) {
      setCount(0);
      return;
    }

    let active = true;
    const unsub = databaseService.subscribePlayerCards(gid, pid, (doc) => {
      if (!active) return;
      const raw = (doc?.cards as Record<string, unknown>[]) ?? [];
      setCount(raw.filter(isInventoryActionCard).length);
    });

    return () => {
      active = false;
      unsub();
    };
  }, [gid, pid, gameId, playerId]);

  return count;
}
