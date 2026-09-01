import type { CardType, GameCard } from "../models/card";
import { isChallengeCardType } from "../models/card";
import { ALL_GAME_CARDS } from "../data/allGameCards";

function rndInt(max: number): number {
  return Math.floor(Math.random() * max);
}

export function serializeCard(
  card: GameCard,
  playerId: string,
  hole: number,
  challengeDifficulty?: string,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: card.id,
    title: card.title,
    description: card.description,
    type: card.type,
    requiresWheelSpin: card.requiresWheelSpin ?? false,
    points: card.points,
    playerId,
    hole,
  };
  if (challengeDifficulty != null) base.difficulty = challengeDifficulty;
  if (card.type === "action") {
    base.banked = false;
    base.offerConsumed = false;
    base.actionCategory = card.actionCategory ?? "standard";
  }
  return base;
}

export function pickCards(
  type: CardType,
  opts: {
    count: number;
    playerId: string;
    hole: number;
    excludeCardIds?: Set<string>;
  },
): Record<string, unknown>[] {
  const { count, playerId, hole, excludeCardIds = new Set() } = opts;
  if (count <= 0) return [];

  let pool = ALL_GAME_CARDS.filter(
    (c) => c.type === type && !excludeCardIds.has(c.id),
  );
  if (pool.length === 0) {
    pool = ALL_GAME_CARDS.filter((c) => c.type === type);
  }
  if (pool.length === 0) return [];

  const available = [...pool];
  const selected: Record<string, unknown>[] = [];
  for (let i = 0; i < count; i++) {
    if (available.length === 0) {
      available.push(...pool);
    }
    const selectedCard = available.splice(rndInt(available.length), 1)[0]!;
    selected.push(serializeCard(selectedCard, playerId, hole));
  }
  return selected;
}

export function pickTieredChallengeDraw(
  playerId: string,
  hole: number,
): Record<string, unknown>[] {
  const tiers = ["easy", "medium", "hard"] as const;
  const usedIds = new Set<string>();
  const out: Record<string, unknown>[] = [];

  function candidatesForTier(tier: string): GameCard[] {
    const challenges = ALL_GAME_CARDS.filter(
      (c) => c.type === "challenge" && !usedIds.has(c.id),
    );
    const inTier = (c: GameCard) => {
      switch (tier) {
        case "easy":
          return c.points <= 1;
        case "medium":
          return c.points >= 2 && c.points <= 3;
        case "hard":
          return c.points >= 4;
        default:
          return true;
      }
    };
    const tiered = challenges.filter(inTier);
    return tiered.length > 0 ? tiered : challenges;
  }

  for (const tier of tiers) {
    let pool = candidatesForTier(tier);
    if (pool.length === 0) {
      pool = ALL_GAME_CARDS.filter(
        (c) => c.type === "challenge" && !usedIds.has(c.id),
      );
    }
    if (pool.length === 0) {
      pool = ALL_GAME_CARDS.filter((c) => c.type === "challenge");
    }
    if (pool.length === 0) break;
    const card = pool[rndInt(pool.length)]!;
    usedIds.add(card.id);
    out.push(serializeCard(card, playerId, hole, tier));
  }
  return out;
}

export function generateRoundCards(
  playerId: string,
  hole: number,
): Record<string, unknown>[] {
  return pickTieredChallengeDraw(playerId, hole);
}

export function mergeKeptActionsForHoleReroll(
  actions: Record<string, unknown>[],
  currentHole: number,
): Record<string, unknown>[] {
  const kept: Record<string, unknown>[] = [];
  for (const raw of actions) {
    const c = { ...raw };
    const h = Number((c.hole as number) ?? currentHole);
    const pending = c.pendingBank === true;
    const banked = c.banked === true;

    if (pending) {
      c.banked = true;
      delete c.pendingBank;
      delete c.offerConsumed;
      kept.push(c);
      continue;
    }
    if (banked) {
      kept.push(c);
      continue;
    }
    if (h !== currentHole) {
      kept.push(c);
    }
  }
  return kept;
}

export { isChallengeCardType };
