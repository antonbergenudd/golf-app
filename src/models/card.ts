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
