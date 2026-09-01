import { useEffect, useState } from "react";

import { databaseService } from "@/services/databaseService";

/**
 * Pending verification count for the tab bar badge — **only requests another player can resolve**
 * (matches `canConfirm` on the Verifications tab: pending and claimant ≠ viewer).
 */
export function useGamePendingVerificationCount(
  gameId: string,
  viewerPlayerId: string,
): number {
  const [count, setCount] = useState(0);
  const gid = gameId.trim();
  const vid = viewerPlayerId.trim();

  useEffect(() => {
    if (!gid) {
      setCount(0);
      return;
    }
    if (!vid) {
      setCount(0);
      return;
    }

    let active = true;

    const refresh = async () => {
      if (!active) return;
      const n = await databaseService.fetchPendingChallengeVerificationCount(
        gid,
        vid,
      );
      if (!active) return;
      setCount(n);
    };

    void refresh();
    const pollIv = setInterval(() => void refresh(), 2500);

    const unsub = databaseService.subscribeChallengeVerifications(gid, () => {
      void refresh();
    });

    return () => {
      active = false;
      clearInterval(pollIv);
      unsub();
    };
  }, [gid, gameId, vid, viewerPlayerId]);

  return count;
}
