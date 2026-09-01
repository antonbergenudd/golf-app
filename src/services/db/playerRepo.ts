import type { TablesUpdate } from "../../lib/database.types";
import { supabase } from "../../lib/supabase";
import { nowIso, subscribeTable } from "./shared";

export async function addPlayer(input: {
  name: string;
  email: string;
  handicap?: number;
}): Promise<void> {
  await supabase.from("players").insert({
    name: input.name,
    email: input.email,
    handicap: input.handicap ?? 0,
    created_at: nowIso(),
  });
}

export function subscribePlayers(
  onNext: (rows: Record<string, unknown>[]) => void,
): () => void {
  return subscribeTable({
    topic: "players-all",
    table: "players",
    load: async () => {
      const { data } = await supabase.from("players").select("*").order("name");
      onNext(data ?? []);
    },
  });
}

export async function updatePlayer(
  playerId: string,
  data: TablesUpdate<"players">,
): Promise<void> {
  await supabase.from("players").update(data).eq("id", playerId);
}

export async function deletePlayer(playerId: string): Promise<void> {
  await supabase.from("players").delete().eq("id", playerId);
}
