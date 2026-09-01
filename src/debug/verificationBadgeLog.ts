/**
 * Debug logging for the verification tab badge was removed.
 * These no-ops remain so Metro fast refresh / stale closures cannot throw
 * `ReferenceError: logVerificationBadge is not defined` if an old subscription
 * callback still runs after a hot reload.
 */
export const VERIFICATION_BADGE_TAG = "[verifications-badge]";

export function logVerificationBadge(
  _message: string,
  _data?: Record<string, unknown>,
): void {}

export function warnVerificationBadge(
  _message: string,
  _data?: Record<string, unknown>,
): void {}
