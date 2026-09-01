/** Expo Router can return `string | string[]`; tab screens may omit parent params while unfocused. */
export function paramFirst(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return String(v[0] ?? "");
  return String(v);
}

function pathnameOnly(path: string): string {
  const s = path.trim();
  if (!s) return "";
  try {
    return new URL(s, "https://example.invalid").pathname;
  } catch {
    const q = s.indexOf("?");
    const h = s.indexOf("#");
    const cut = Math.min(q >= 0 ? q : s.length, h >= 0 ? h : s.length);
    return s.slice(0, cut);
  }
}

/** Expo `useSegments()` — find a UUID-like segment (dynamic `[gameId]`), or segment after `game`. */
function gameIdFromSegments(segments: readonly string[] | undefined): string {
  if (!segments?.length) return "";
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  for (const s of segments) {
    const t = String(s).trim();
    if (uuidRe.test(t)) return t;
  }
  const i = segments.findIndex((s) => s === "game");
  if (i < 0 || i + 1 >= segments.length) return "";
  const next = String(segments[i + 1] ?? "").trim();
  if (!next || next.startsWith("(")) return "";
  if (next === "[gameId]") return "";
  if (
    next === "inventory" ||
    next === "scorecard" ||
    next === "verifications" ||
    next === "index"
  ) {
    return "";
  }
  return next;
}

/**
 * Resolves the active round id for subscriptions and badges.
 * Prefer explicit params; then route segments; then parsing `/.../game/<id>/...` from pathname.
 */
export function resolveSessionGameId(input: {
  local: Record<string, unknown>;
  global: Record<string, unknown>;
  pathname: string;
  segments?: readonly string[];
}): string {
  const fromParams =
    paramFirst(input.local.gameId) || paramFirst(input.global.gameId);
  const trimmed = fromParams.trim();
  if (trimmed) return trimmed;

  const fromSeg = gameIdFromSegments(input.segments).trim();
  if (fromSeg) return fromSeg;

  const path = pathnameOnly(input.pathname);
  const m = path.match(/(?:^|\/)game\/([^/]+)/);
  return (m?.[1] ?? "").trim();
}
