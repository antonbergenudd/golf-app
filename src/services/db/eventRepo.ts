import { supabase } from "../../lib/supabase";
import { channelTopic } from "./shared";

export { addGameEvent } from "./shared";

export function subscribeGameEvents(
  gameId: string,
  onNext: (rows: Record<string, unknown>[]) => void,
): () => void {
  let lastRealtimeAt = 0;

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
      {
        event: "*",
        schema: "public",
        table: "game_events",
        filter: `game_id=eq.${gameId}`,
      },
      () => {
        lastRealtimeAt = Date.now();
        void load();
      },
    )
    .subscribe();

  // Fallback only: if Realtime is off or `game_events` is missing from the
  // publication, poll — but stay quiet while realtime is clearly delivering.
  const poll = setInterval(() => {
    if (Date.now() - lastRealtimeAt > 15000) void load();
  }, 15000);

  return () => {
    clearInterval(poll);
    void supabase.removeChannel(ch);
  };
}
