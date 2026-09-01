import { supabase, supabaseConfigured } from "./supabase";

let bootstrap: Promise<void> | null = null;

/**
 * Make sure there is a Supabase session, signing in anonymously if there isn't.
 * Safe to call repeatedly — the work runs once. No-ops when Supabase isn't
 * configured or the project has anonymous sign-ins disabled (the app keeps
 * working with the device-generated player id in that case).
 *
 * Nothing enforces auth yet; this exists so `auth.uid()` is available for the
 * RLS + identity work on the roadmap.
 */
export function ensureAuthSession(): Promise<void> {
  if (!bootstrap) bootstrap = run();
  return bootstrap;
}

async function run(): Promise<void> {
  if (!supabaseConfigured) return;
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session) return;
    const { error } = await supabase.auth.signInAnonymously();
    if (error && __DEV__) {
      console.warn(
        `[auth] anonymous sign-in unavailable (${error.message}). ` +
          "Enable it in Supabase → Authentication → Providers, or set " +
          "enable_anonymous_sign_ins = true and run `supabase config push`.",
      );
    }
  } catch (e) {
    if (__DEV__) console.warn("[auth] session bootstrap failed:", e);
  }
}

/** Current anonymous (or, later, linked) user id, or null if there's no session. */
export async function getAuthUserId(): Promise<string | null> {
  if (!supabaseConfigured) return null;
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}
