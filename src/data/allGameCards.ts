import type { GameCard } from "../models/card";
import { ATTACK_ACTION_CARDS } from "./attackActionCards";
import { CHALLENGE_CARDS } from "./challengeCards";
import { STANDARD_ACTION_CARDS } from "./standardActionCards";

export const ALL_GAME_CARDS: GameCard[] = [
  ...CHALLENGE_CARDS,
  ...STANDARD_ACTION_CARDS,
  ...ATTACK_ACTION_CARDS,
];
