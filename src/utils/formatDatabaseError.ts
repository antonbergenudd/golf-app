/** User-facing message for Supabase / network failures (create lobby, join, etc.). */
export function formatDatabaseError(e: unknown): string {
  const msg =
    e && typeof e === "object" && "message" in e
      ? String((e as { message: unknown }).message)
      : String(e ?? "Unknown error");

  const lower = msg.toLowerCase();
  if (
    lower.includes("fetch failed") ||
    lower.includes("enotfound") ||
    lower.includes("network request failed") ||
    lower.includes("failed to fetch")
  ) {
    return [
      "Cannot reach your Supabase project.",
      "Check `.env`: EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY from supabase.com → Project Settings → API.",
      "If the project was deleted or paused, create a new project, update `.env`, and apply `supabase/migrations` in the SQL editor.",
    ].join(" ");
  }

  if (e && typeof e === "object") {
    const err = e as {
      message?: string;
      code?: string;
      details?: string;
      hint?: string;
    };
    const parts: string[] = [];
    if (err.message) parts.push(err.message);
    if (err.code && err.code !== err.message) parts.push(`(${err.code})`);
    if (err.hint) parts.push(err.hint);
    if (err.details) parts.push(err.details);
    if (parts.length > 0) return parts.join(" — ");
  }

  return msg;
}
