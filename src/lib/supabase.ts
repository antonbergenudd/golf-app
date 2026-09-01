import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** True when the app has real Supabase credentials wired in. */
export const supabaseConfigured = Boolean(url && anonKey);

if (__DEV__ && !supabaseConfigured) {
  console.warn(
    "[supabase] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env and add your project keys.",
  );
}

// Placeholders keep `createClient` from throwing at import time (newer
// supabase-js rejects an empty URL outright). Any real call then fails with a
// network error, which `formatDatabaseError` turns into a "check your .env"
// message. Guard user-facing entry points with `supabaseConfigured` for a
// cleaner message.
export const supabase = createClient(
  url || "http://localhost:54321",
  anonKey || "public-anon-key",
);
