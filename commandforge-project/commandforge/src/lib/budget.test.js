import { describe, it, expect } from "vitest";
import {
  priceOf, cheapestFirst, perCardCap, pickWithinBudget, upgradeWithinBudget,
  formatPrice, trimToBudget, UNKNOWN_PRICE_ESTIMATE, MAX_BUDGET_SHARE,
} from "./budget";

const card = (name) => ({ name });
const priced = (entries) =>
  Object.fromEntries(entries.map(([name, usd, eur = null]) => [name.toLowerCase(), { name, priceUsd: usd, priceEur: eur }]));

function budgetState(total, slots, discretionary = total) {
  return { active: true, total, remaining: total, slotsRemaining: slots, discretionary };
}

describe("priceOf", () => {
  const data = priced([["Sol Ring", "1.50", "1.20"], ["No Price", null, null]]);

  it("reads the chosen currency, ignoring name case", () => {
    expect(priceOf("sol ring", data, "usd")).toBe(1.5);
    expect(priceOf("SOL RING", data, "eur")).toBe(1.2);
  });

  it("returns null for unknown or unpriced cards", () => {
    expect(priceOf("Missing", data, "usd")).toBeNull();
    expect(priceOf("No Price", data, "usd")).toBeNull();
  });
});

describe("cheapestFirst", () => {
  it("sorts by price and treats unpriced cards as the flat estimate", () => {
    const data = priced([["A", "5"], ["B", "0.5"], ["C", "3"]]);
    const sorted = cheapestFirst([card("A"), card("B"), card("C"), card("Unpriced")], data, "usd");
    expect(sorted.map((c) => c.name)).toEqual(["B", "Unpriced", "C", "A"]);
    expect(UNKNOWN_PRICE_ESTIMATE).toBe(2);
  });
});

describe("perCardCap", () => {
  it("is unlimited without a budget", () => {
    expect(perCardCap({ active: false })).toBe(Infinity);
  });

  it("uses the per-slot average when that is the lower ceiling", () => {
    // 100 over 90 slots, times the splurge factor of 9, is exactly 10.
    expect(perCardCap(budgetState(100, 90))).toBeCloseTo(10);
  });

  it("never lets one card take more than the hard share of the budget", () => {
    expect(perCardCap(budgetState(100, 1))).toBeCloseTo(100 * MAX_BUDGET_SHARE);
  });

  it("drops to zero rather than going negative when the money is gone", () => {
    const state = budgetState(100, 10);
    state.remaining = -5;
    expect(perCardCap(state)).toBe(0);
  });
});

describe("pickWithinBudget", () => {
  it("takes the first cards in order when there is no budget", () => {
    const list = ["A", "B", "C", "D"].map(card);
    expect(pickWithinBudget(list, 2, {}, "none", { active: false }).map((c) => c.name)).toEqual(["A", "B"]);
  });

  it("skips a card over the per-card ceiling even if the budget could cover it", () => {
    const data = priced([["Whale", "50"], ["A", "1"], ["B", "1"]]);
    const list = [card("Whale"), card("A"), card("B")];
    const state = budgetState(100, 10);
    const chosen = pickWithinBudget(list, 2, data, "usd", state, cheapestFirst(list, data, "usd"));
    expect(chosen.map((c) => c.name)).toEqual(["A", "B"]);
  });

  it("fills remaining slots with the cheapest cards when upgrades don't fit", () => {
    const data = priced([["Pricey", "10"], ["Cheap1", "0.1"], ["Cheap2", "0.2"]]);
    const list = [card("Pricey"), card("Cheap1"), card("Cheap2")];
    // No money above the cheapest build, so the 10 card is out.
    const state = budgetState(0.3, 2, 0);
    const chosen = pickWithinBudget(list, 2, data, "usd", state, cheapestFirst(list, data, "usd"));
    expect(chosen.map((c) => c.name).sort()).toEqual(["Cheap1", "Cheap2"]);
    expect(state.remaining).toBeCloseTo(0);
  });

  it("never picks the same card twice", () => {
    const data = priced([["A", "1"], ["B", "1"], ["C", "1"]]);
    const list = ["A", "B", "C"].map(card);
    const chosen = pickWithinBudget(list, 3, data, "usd", budgetState(3, 3, 0), cheapestFirst(list, data, "usd"));
    expect(new Set(chosen).size).toBe(3);
  });
});

describe("upgradeWithinBudget", () => {
  it("swaps the least-played card for a more played one the leftover money covers", () => {
    // Category order is popularity order: Top is the most played.
    const pool = ["Top", "Mid", "Low"].map(card);
    const data = priced([["Top", "4"], ["Mid", "1"], ["Low", "0.5"]]);
    const picks = { draw: [card("Mid"), card("Low")] };
    const used = new Set(["mid", "low"]);
    const state = budgetState(100, 10, 50);
    upgradeWithinBudget(picks, { draw: pool }, used, data, "usd", state);
    expect(picks.draw.map((c) => c.name).sort()).toEqual(["Mid", "Top"]);
    expect(used.has("top")).toBe(true);
    expect(used.has("low")).toBe(false);
    expect(state.discretionary).toBeCloseTo(50 - 3.5);
  });

  it("never trades away a guaranteed staple like Sol Ring", () => {
    const pool = ["Mana Crypt", "Sol Ring"].map(card);
    const data = priced([["Mana Crypt", "5"], ["Sol Ring", "1"]]);
    const picks = { ramp: [card("Sol Ring")] };
    upgradeWithinBudget(picks, { ramp: pool }, new Set(["sol ring"]), data, "usd", budgetState(100, 10, 50));
    expect(picks.ramp.map((c) => c.name)).toEqual(["Sol Ring"]);
  });

  it("does nothing without a budget", () => {
    const picks = { draw: [card("Low")] };
    upgradeWithinBudget(picks, { draw: ["Top", "Low"].map(card) }, new Set(["low"]), {}, "none", { active: false });
    expect(picks.draw.map((c) => c.name)).toEqual(["Low"]);
  });
});

describe("formatPrice", () => {
  it("formats dollars and euros to two places", () => {
    expect(formatPrice("1.5", "usd")).toBe("$1.50");
    expect(formatPrice(12, "eur")).toBe("€12.00");
  });

  it("shows a dash for missing or unreadable prices", () => {
    expect(formatPrice(null, "usd")).toBe("—");
    expect(formatPrice("abc", "usd")).toBe("—");
  });
});

describe("trimToBudget", () => {
  const cardData = Object.fromEntries(
    [["Sol Ring", 2], ["Big Spell", 20], ["Mid Spell", 5.03], ["Cheap Spell", 0.5], ["Cheaper Spell", 0.25], ["Shock", 12], ["Gate", 0.2]]
      .map(([name, usd]) => [name.toLowerCase(), { name, priceUsd: String(usd) }])
  );
  const card = (name) => ({ name });
  const pools = {
    ramp: [card("Sol Ring"), card("Big Spell"), card("Mid Spell"), card("Cheap Spell"), card("Cheaper Spell")],
    lands: [card("Shock"), card("Gate")],
  };
  const run = (picks, limit, allowed) =>
    trimToBudget({ picks, poolFor: (role) => pools[role], limit, cardData, priceSource: "usd", allowed });

  it("makes the smallest swap that gets a few pence over back under", () => {
    // 2 + 20 + 5.03 = 27.03, so 3p over a 27 budget.
    const next = run({ ramp: [card("Sol Ring"), card("Big Spell"), card("Mid Spell")] }, 27);
    expect(next.ramp.map((c) => c.name)).toEqual(["Sol Ring", "Big Spell", "Cheaper Spell"]);
  });

  it("keeps going until the deck fits, swapping lands too, and never drops Sol Ring", () => {
    const next = run({ ramp: [card("Sol Ring"), card("Big Spell")], lands: [card("Shock")] }, 5);
    expect(next.ramp[0].name).toBe("Sol Ring");
    expect(next.lands.map((c) => c.name)).toEqual(["Gate"]);
    const total = [...next.ramp, ...next.lands].reduce((s, c) => s + parseFloat(cardData[c.name.toLowerCase()].priceUsd), 0);
    expect(total).toBeLessThanOrEqual(5);
  });

  it("leaves a deck that already fits alone, and skips cards that aren't allowed", () => {
    const picks = { ramp: [card("Big Spell")] };
    expect(run(picks, 100)).toEqual(picks);
    expect(run(picks, 1, (c) => c.name !== "Cheaper Spell").ramp[0].name).toBe("Cheap Spell");
  });
});
