/** Structured outcome after resolving an attack action card (inventory). */
export type AttackResolveOutcome =
  | { kind: "stole_card"; cardTitle: string }
  | { kind: "no_stealable_cards" }
  | { kind: "destroyed_card"; cardTitle: string }
  | { kind: "nothing_to_destroy" }
  | { kind: "market_locked" }
  | { kind: "stole_points"; amount: number }
  | { kind: "no_points_to_steal" }
  | { kind: "action_steal_armed" }
  | { kind: "tabletop"; cardTitle: string };
