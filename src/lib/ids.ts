import * as Crypto from "expo-crypto";

/**
 * RFC-4122 v4 UUID from the platform CSPRNG.
 *
 * Use this for anything that must not collide or be guessable — verification
 * ids, realtime channel topics, generated card copies. `Date.now()` and
 * `Math.random()` are not safe for those: two players acting in the same tick
 * collide, and the values are trivially predictable.
 */
export function newUuid(): string {
  return Crypto.randomUUID();
}

/** Player identity token. Opaque; only ever compared for equality. */
export function newPlayerId(): string {
  return `player_${Crypto.randomUUID()}`;
}
