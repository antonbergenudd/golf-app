/**
 * User-facing text for a failed in-game action.
 *
 * The server-authoritative RPCs raise plain-English rule messages ("Challenge
 * already claimed", "Action buying is locked for this hole") — those pass
 * straight through. Network failures get a connection message. Anything that
 * doesn't look like a sentence a player should read falls back to generic.
 */
export function gameActionError(e: unknown): string {
  const raw =
    e && typeof e === "object" && "message" in e
      ? String((e as { message: unknown }).message)
      : String(e ?? "");
  const msg = raw.replace(/^Error:\s*/i, "").trim();
  const lower = msg.toLowerCase();

  if (
    lower.includes("fetch failed") ||
    lower.includes("network request failed") ||
    lower.includes("failed to fetch") ||
    lower.includes("load failed") ||
    lower.includes("networkerror") ||
    lower.includes("timeout")
  ) {
    return "Lost connection — check your signal and try again.";
  }

  if (lower.includes("not in this game")) {
    return "Your round is out of sync. Leave and rejoin from the code.";
  }

  // A short, lower-case-containing sentence with no JSON/stack noise is almost
  // certainly a deliberate rule message — show it as-is.
  if (
    msg.length > 0 &&
    msg.length <= 140 &&
    /[a-z]/.test(msg) &&
    !msg.includes("{") &&
    !msg.includes("\n")
  ) {
    return msg;
  }

  return "That didn't go through — try again.";
}
