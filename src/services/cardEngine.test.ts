import { ALL_GAME_CARDS } from "../data/allGameCards";
import {
  mergeKeptActionsForHoleReroll,
  pickCards,
  pickTieredChallengeDraw,
  serializeCard,
} from "./cardEngine";

describe("pickCards", () => {
  it("returns the requested count", () => {
    const out = pickCards("action", { count: 3, playerId: "p1", hole: 1 });
    expect(out).toHaveLength(3);
    expect(out.every((c) => c.type === "action")).toBe(true);
  });

  it("stamps playerId and hole on every card", () => {
    const out = pickCards("action", { count: 2, playerId: "pX", hole: 7 });
    expect(out.every((c) => c.playerId === "pX" && c.hole === 7)).toBe(true);
  });

  it("honours excludeCardIds when the pool is large enough", () => {
    const first = ALL_GAME_CARDS.find((c) => c.type === "action")!;
    const out = pickCards("action", {
      count: 1,
      playerId: "p1",
      hole: 1,
      excludeCardIds: new Set([first.id]),
    });
    // With >1 action card available, the excluded id must not come back.
    expect(out[0]!.id).not.toBe(first.id);
  });

  it("returns [] for a non-positive count", () => {
    expect(pickCards("action", { count: 0, playerId: "p1", hole: 1 })).toEqual(
      [],
    );
  });
});

describe("pickTieredChallengeDraw", () => {
  it("draws three distinct challenge cards tagged easy/medium/hard", () => {
    const out = pickTieredChallengeDraw("p1", 3);
    expect(out).toHaveLength(3);
    expect(out.map((c) => c.difficulty)).toEqual(["easy", "medium", "hard"]);
    expect(new Set(out.map((c) => c.id)).size).toBe(3);
    expect(out.every((c) => c.type === "challenge")).toBe(true);
  });
});

describe("serializeCard", () => {
  it("adds action bookkeeping fields only for action cards", () => {
    const action = ALL_GAME_CARDS.find((c) => c.type === "action")!;
    const challenge = ALL_GAME_CARDS.find((c) => c.type === "challenge")!;
    expect(serializeCard(action, "p", 1)).toMatchObject({
      banked: false,
      offerConsumed: false,
      actionCategory: expect.any(String),
    });
    expect(serializeCard(challenge, "p", 1).banked).toBeUndefined();
  });
});

describe("mergeKeptActionsForHoleReroll", () => {
  it("promotes pendingBank cards to banked and keeps them", () => {
    const kept = mergeKeptActionsForHoleReroll(
      [{ id: "a", type: "action", hole: 2, pendingBank: true }],
      2,
    );
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ banked: true });
    expect(kept[0]!.pendingBank).toBeUndefined();
  });

  it("keeps banked cards and drops un-banked offers from the current hole", () => {
    const kept = mergeKeptActionsForHoleReroll(
      [
        { id: "banked", type: "action", hole: 1, banked: true },
        { id: "thisHoleOffer", type: "action", hole: 2 },
        { id: "oldHoleOffer", type: "action", hole: 1 },
      ],
      2,
    );
    expect(kept.map((c) => c.id).sort()).toEqual(["banked", "oldHoleOffer"]);
  });
});
