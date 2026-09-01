import { useEffect, useRef, useState } from "react";

import { supabase } from "@/lib/supabase";

/**
 * Tracks whether the Supabase realtime socket is up. Polls the socket state
 * (there's no public open/close event on the client) and debounces the "down"
 * transition so a brief blip between holes doesn't flash a banner. Returns
 * `true` while healthy or only momentarily disconnected.
 */
export function useRealtimeConnected(
  pollMs = 2000,
  downAfterMs = 3000,
): boolean {
  const [connected, setConnected] = useState(true);
  const downSinceRef = useRef<number | null>(null);

  useEffect(() => {
    const check = () => {
      const open = supabase.realtime.connectionState() === "open";
      if (open) {
        downSinceRef.current = null;
        setConnected(true);
        return;
      }
      const now = Date.now();
      if (downSinceRef.current == null) downSinceRef.current = now;
      setConnected(now - downSinceRef.current < downAfterMs);
    };
    check();
    const id = setInterval(check, pollMs);
    return () => clearInterval(id);
  }, [pollMs, downAfterMs]);

  return connected;
}
