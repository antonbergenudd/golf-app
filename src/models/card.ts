export type CardType = "direct" | "action" | "challenge";

export type ActionCardCategory = "standard" | "attack";

export type GameCard = {
  id: string;
  title: string;
  description: string;
  type: CardType;
  requiresWheelSpin?: boolean;
  points: number;
  actionCategory?: ActionCardCategory;
};

export function isAttackActionCard(card: Record<string, unknown>): boolean {
  if (card.type !== "action") return false;
  return card.actionCategory === "attack";
}

export function isChallengeCardType(type: string | undefined | null): boolean {
  return type === "challenge" || type === "passive";
}

/** Action cards in the bag (market buy / hole rollover), not yet played from inventory. */
export function isInventoryActionCard(c: Record<string, unknown>): boolean {
  if (c.type !== "action") return false;
  if (c.inventoryUsed === true) return false;
  return c.banked === true || c.pendingBank === true;
}
