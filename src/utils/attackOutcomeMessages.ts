import type { AttackResolveOutcome } from "@/models/attackResolveOutcome";

export type AttackFeedbackTone = "celebrate" | "neutral" | "oops";

export type AttackFeedbackCopy = {
  title: string;
  body: string;
  tone: AttackFeedbackTone;
};

/** User-facing copy after resolving an attack card from inventory. */
export function formatAttackOutcome(
  outcome: AttackResolveOutcome,
  targetName: string,
): AttackFeedbackCopy {
  const Y = targetName.trim() || "they";

  switch (outcome.kind) {
    case "stole_card":
      return {
        title: "Hooray!",
        body: `You stole ${outcome.cardTitle} from ${Y}.`,
        tone: "celebrate",
      };
    case "no_stealable_cards":
      return {
        title: "Oh no…",
        body: `${Y} didn’t have any cards to steal. Unlucky.`,
        tone: "oops",
      };
    case "destroyed_card":
      return {
        title: "Gone",
        body: `You destroyed ${Y}’s ${outcome.cardTitle}.`,
        tone: "celebrate",
      };
    case "nothing_to_destroy":
      return {
        title: "Nothing to destroy",
        body: `${Y} had no banked actions to destroy.`,
        tone: "oops",
      };
    case "market_locked":
      return {
        title: "Locked out",
        body: `${Y} can’t buy market cards for this hole.`,
        tone: "celebrate",
      };
    case "stole_points":
      return {
        title: "Payday",
        body: `You stole ${outcome.amount} pt${outcome.amount === 1 ? "" : "s"} from ${Y}.`,
        tone: "celebrate",
      };
    case "no_points_to_steal":
      return {
        title: "Empty pockets",
        body: `${Y} didn’t have any points to take.`,
        tone: "oops",
      };
    case "action_steal_armed":
      return {
        title: "You’re set",
        body: `You’ll get a copy of the next action another player plays.`,
        tone: "neutral",
      };
    case "tabletop":
      return {
        title: outcome.cardTitle,
        body: `Your attack on ${Y} is in effect — resolve the details at the table.`,
        tone: "neutral",
      };
  }
}

/**
 * For the **target** of an attack: what they were hit with and the result
 * (used with `game_events.attack_resolved` on the game screen).
 */
export function formatVictimAttackOutcome(
  outcome: AttackResolveOutcome,
  attackerName: string,
  attackCardTitle: string,
): { title: string; body: string } {
  const A = attackerName.trim() || "Another player";
  const card = attackCardTitle.trim() || "an action card";

  switch (outcome.kind) {
    case "stole_card":
      return {
        title: `${A} targeted you`,
        body: `They used “${card}” and took your “${outcome.cardTitle}”.`,
      };
    case "no_stealable_cards":
      return {
        title: `${A} targeted you`,
        body: `They used “${card}” and tried to steal a card, but you had nothing they could take.`,
      };
    case "destroyed_card":
      return {
        title: `${A} targeted you`,
        body: `They used “${card}” and destroyed your “${outcome.cardTitle}”.`,
      };
    case "nothing_to_destroy":
      return {
        title: `${A} targeted you`,
        body: `They used “${card}” to destroy a card, but you had no valid card to lose.`,
      };
    case "market_locked":
      return {
        title: `${A} targeted you`,
        body: `They used “${card}” — you can’t buy from the market for the rest of this hole.`,
      };
    case "stole_points":
      return {
        title: `${A} targeted you`,
        body: `They used “${card}” and took ${outcome.amount} point${outcome.amount === 1 ? "" : "s"} from you.`,
      };
    case "no_points_to_steal":
      return {
        title: `${A} targeted you`,
        body: `They used “${card}” to steal points, but you didn’t have any to lose.`,
      };
    case "action_steal_armed":
      return {
        title: `${A} targeted you`,
        body: `They played “${card}” on you. Their copy-next-action effect applies to them — watch the table.`,
      };
    case "tabletop":
      return {
        title: `${A} targeted you`,
        body: `They played “${outcome.cardTitle ?? card}”. Resolve any remaining effects at the table.`,
      };
  }
}

/** Deserialize outcome stored in `game_events.event_data.outcome` (jsonb). */
export function parseAttackOutcomeFromEvent(
  raw: unknown,
): AttackResolveOutcome | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const kind = String(r.kind ?? "");
  switch (kind) {
    case "stole_card":
      return {
        kind: "stole_card",
        cardTitle: String(r.cardTitle ?? "Action card"),
      };
    case "no_stealable_cards":
      return { kind: "no_stealable_cards" };
    case "destroyed_card":
      return {
        kind: "destroyed_card",
        cardTitle: String(r.cardTitle ?? "action"),
      };
    case "nothing_to_destroy":
      return { kind: "nothing_to_destroy" };
    case "market_locked":
      return { kind: "market_locked" };
    case "stole_points": {
      const n = Number(r.amount);
      return {
        kind: "stole_points",
        amount: Number.isFinite(n) ? n : 0,
      };
    }
    case "no_points_to_steal":
      return { kind: "no_points_to_steal" };
    case "action_steal_armed":
      return { kind: "action_steal_armed" };
    case "tabletop":
      return { kind: "tabletop", cardTitle: String(r.cardTitle ?? "Attack") };
    default:
      return null;
  }
}
