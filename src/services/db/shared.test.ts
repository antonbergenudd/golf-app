import { applyDeltasToPoints } from "./shared";

describe("applyDeltasToPoints", () => {
  it("adds and subtracts per player", () => {
    expect(applyDeltasToPoints({ a: 5, b: 2 }, { a: 3, b: -1 })).toEqual({
      a: 8,
      b: 1,
    });
  });

  it("floors a balance at zero", () => {
    expect(applyDeltasToPoints({ a: 1 }, { a: -5 })).toEqual({ a: 0 });
  });

  it("creates an entry for an unseen player", () => {
    expect(applyDeltasToPoints({}, { a: 4 })).toEqual({ a: 4 });
  });

  it("ignores zero deltas and leaves other players untouched", () => {
    expect(applyDeltasToPoints({ a: 3, b: 9 }, { a: 0 })).toEqual({
      a: 3,
      b: 9,
    });
  });

  it("does not mutate the input", () => {
    const prev = { a: 1 };
    applyDeltasToPoints(prev, { a: 1 });
    expect(prev).toEqual({ a: 1 });
  });

  it("floors fractional results", () => {
    expect(applyDeltasToPoints({ a: 0 }, { a: 2.7 })).toEqual({ a: 2 });
  });
});
