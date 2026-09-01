import * as cardRepo from "./db/cardRepo";
import * as eventRepo from "./db/eventRepo";
import * as gameRepo from "./db/gameRepo";
import * as lobbyRepo from "./db/lobbyRepo";
import * as playerRepo from "./db/playerRepo";
import * as scoreRepo from "./db/scoreRepo";
import * as verificationRepo from "./db/verificationRepo";
import { REROLL_HAND_MAX_USES } from "./db/shared";

/**
 * Config constants only. Every data-access method now lives in
 * `src/services/db/*`, grouped by table/domain; `databaseService` below
 * re-exports them so existing `databaseService.foo()` call sites are unchanged.
 *
 * When adding behaviour, put it in the relevant repo (or a new one) rather than
 * growing this file back into one class.
 */
export class DatabaseService {
  /** Rerolls no longer cost balance (UI historically referenced this). */
  static rerollHandCostPoints = 0;
  /** One free manual reroll per hole per tab (challenges vs market); resets on hole advance. */
  static rerollHandMaxUses = REROLL_HAND_MAX_USES;
}

export const databaseService = {
  ...playerRepo,
  ...scoreRepo,
  ...lobbyRepo,
  ...gameRepo,
  ...cardRepo,
  ...verificationRepo,
  ...eventRepo,
};
