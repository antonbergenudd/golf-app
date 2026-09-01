/**
 * Unit tests for the optimistic-concurrency wrapper. supabase is mocked with a
 * tiny in-memory row that honours the `updated_at` guard, so we can simulate a
 * concurrent writer landing between our read and our write.
 */
/* eslint-disable import/first -- jest.mock is hoisted above imports by design */

type Row = Record<string, unknown>;

const state: {
  row: Row;
  /** Runs once, just before the next guarded write is evaluated. */
  interpose: (() => void) | null;
  writes: number;
} = { row: {}, interpose: null, writes: 0 };

jest.mock("../../lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: state.row }),
        }),
      }),
      update: (payload: Row) => {
        let guard: unknown;
        const builder: Record<string, unknown> = {
          eq: (col: string, val: unknown) => {
            if (col === "updated_at") guard = val;
            return builder;
          },
          select: async () => {
            if (state.interpose) {
              const fn = state.interpose;
              state.interpose = null;
              fn();
            }
            if (guard !== undefined && guard !== state.row.updated_at) {
              return { data: [], error: null };
            }
            state.writes += 1;
            state.row = { ...state.row, ...payload };
            return { data: [{ id: state.row.id }], error: null };
          },
        };
        return builder;
      },
    }),
  },
}));

import { mutatePlayerCards } from "./shared";

beforeEach(() => {
  state.row = {
    id: "g_p",
    updated_at: "t0",
    cards: [{ id: "a" }, { id: "b" }],
  };
  state.interpose = null;
  state.writes = 0;
});

it("writes the mutated cards on a clean run", async () => {
  await mutatePlayerCards("g_p", (cards) => {
    cards.push({ id: "c" });
    return { cards };
  });
  expect(state.row.cards).toHaveLength(3);
  expect(state.writes).toBe(1);
});

it("returns the plan result", async () => {
  const out = await mutatePlayerCards<string>("g_p", (cards) => ({
    cards,
    result: `have ${cards.length}`,
  }));
  expect(out).toBe("have 2");
});

it("does not write when the plan returns null", async () => {
  await mutatePlayerCards("g_p", () => null);
  expect(state.writes).toBe(0);
});

it("retries and still lands after one lost race", async () => {
  let calls = 0;
  // First write attempt: a concurrent writer bumps updated_at, so our guarded
  // write matches 0 rows and we retry against the new state.
  state.interpose = () => {
    state.row = { ...state.row, updated_at: "t1" };
  };
  await mutatePlayerCards("g_p", (cards) => {
    calls += 1;
    return { cards: [...cards, { id: `n${calls}` }] };
  });
  expect(calls).toBe(2);
  expect(state.writes).toBe(1);
  expect(state.row.updated_at).not.toBe("t1"); // our nowIso() write won
});

it("propagates a throw from the plan", async () => {
  await expect(
    mutatePlayerCards("g_p", () => {
      throw new Error("nope");
    }),
  ).rejects.toThrow("nope");
});

it("throws when the row is missing", async () => {
  state.row = undefined as unknown as Row;
  await expect(
    mutatePlayerCards("g_p", (cards) => ({ cards })),
  ).rejects.toThrow("Player cards not found");
});
