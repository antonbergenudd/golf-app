// Runs before modules are imported. Gives src/lib/supabase.ts non-empty values
// so its "missing .env" dev warning does not spam the test output. No test
// hits the network — the client is never actually used in unit tests.
process.env.EXPO_PUBLIC_SUPABASE_URL ||= "http://localhost:54321";
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";
