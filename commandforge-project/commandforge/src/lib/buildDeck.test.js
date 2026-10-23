import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildDeck, BRACKETS } from "./buildDeck";

// A stand-in for Scryfall: every search returns 120 made-up cards whose names
// come from the query, so each category gets its own pool. Lands make every
// colour so they always count as fixing.
function fakeScryfall() {
  return vi.fn(async (url, init) => {
    if (url.includes("/cards/collection")) {
      const { identifiers } = JSON.parse(init.body);
      const data = identifiers.map(({ name }) => ({ name, prices: { usd: "0.10", eur: "0.10" } }));
      return { ok: true, status: 200, json: async () => ({ data }) };
    }
    const q = decodeURIComponent(new URL(url).searchParams.get("q"));
    if (q.startsWith("(!")) return { ok: false, status: 404, json: async () => ({}) };
    const isLand = q.includes(" t:land");
    const tag = q.replace(/[^a-z]/gi, "").slice(-24);
    const data = Array.from({ length: 120 }, (_, i) => ({
      name: `${isLand ? "Land" : "Spell"} ${tag} ${i}`,
      // Most played first, with prices from $0.25 up to about $30.
      prices: { usd: (0.25 + ((i * 7) % 120) / 4).toFixed(2), eur: null },
      produced_mana: isLand ? ["W", "U", "B", "R", "G"] : undefined,
      oracle_text: "",
    }));
    return { ok: true, status: 200, json: async () => ({ data }) };
  });
}

const commander = { name: "Test Commander", identity: ["U", "R"], archetype: null, priceUsd: "5.00", priceEur: null };

function allCards(deck) {
  return [
    ...Object.values(deck.picks).flat().map((c) => ({ name: c.name, qty: 1 })),
    ...deck.nonbasics,
    ...deck.basics,
  ];
}

function deckCost(deck) {
  const price = (name) => parseFloat(deck.cardData[name.toLowerCase()]?.priceUsd ?? 0);
  return Object.values(deck.picks).flat().reduce((s, c) => s + price(c.name), 0)
    + deck.nonbasics.reduce((s, l) => s + price(l.name) * l.qty, 0);
}

describe("buildDeck", () => {
  beforeEach(() => vi.stubGlobal("fetch", fakeScryfall()));
  afterEach(() => vi.unstubAllGlobals());

  it.each(BRACKETS.map((b) => [b.name, b]))("builds exactly 99 cards for bracket %s", async (_, bracket) => {
    const deck = await buildDeck(commander, "random", bracket);
    const cards = allCards(deck);
    expect(cards.reduce((s, c) => s + c.qty, 0)).toBe(99);
    expect(deck.shortfall).toBe(0);
    // Singleton: only basic lands may repeat, and the commander isn't in the 99.
    const names = cards.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).not.toContain(commander.name);
    // Each category gets the number the bracket's recipe asks for.
    Object.entries(bracket.recipe).forEach(([cat, n]) => expect(deck.picks[cat]).toHaveLength(n));
  });

  it("splits basics across the commander's colours", async () => {
    const deck = await buildDeck(commander, "random", BRACKETS[1]);
    expect(deck.basics.map((b) => b.name).sort()).toEqual(["Island", "Mountain"]);
  });

  it("keeps the deck and commander within the budget", async () => {
    const budget = 150;
    const deck = await buildDeck(commander, "random", BRACKETS[2], { budget, priceSource: "usd" });
    expect(deck.budgetActive).toBe(true);
    expect(deckCost(deck) + 5).toBeLessThanOrEqual(budget);
    // ...and actually spends most of it on better cards rather than leaving it idle.
    expect(deckCost(deck) + 5).toBeGreaterThan(budget * 0.8);
  });

  it("gives a mono-colour deck its colour's staple lands first", async () => {
    const scryfall = fakeScryfall();
    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
      const q = url.includes("/cards/search") ? decodeURIComponent(new URL(url).searchParams.get("q")) : "";
      if (q.includes('!"Cabal Coffers"')) {
        const names = [...q.matchAll(/!"([^"]+)"/g)].map((m) => m[1]);
        return { ok: true, status: 200, json: async () => ({ data: names.map((name) => ({ name, prices: { usd: "1.00" }, oracle_text: "" })) }) };
      }
      return scryfall(url, init);
    }));
    const monoBlack = { name: "Mono Commander", identity: ["B"], archetype: null, priceUsd: "1.00", priceEur: null };
    const deck = await buildDeck(monoBlack, "edhrec", BRACKETS[2], { priceSource: "usd" });
    expect(deck.nonbasics.map((l) => l.name).slice(0, 3)).toEqual(["Cabal Coffers", "Urborg, Tomb of Yawgmoth", "Castle Locthwain"]);
    expect(deck.nonbasics).toHaveLength(6);
    expect(allCards(deck).reduce((s, c) => s + c.qty, 0)).toBe(99);
  });

  it("stays within the budget when guessed prices turn out higher", async () => {
    // Every tenth card comes back from the search unpriced, so it's budgeted
    // at a guess, and the later price lookup says it costs $9.99.
    const scryfall = fakeScryfall();
    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
      const q = url.includes("/cards/search") ? decodeURIComponent(new URL(url).searchParams.get("q")) : "";
      if (q.startsWith("(!")) {
        const names = [...q.matchAll(/!"([^"]+)"/g)].map((m) => m[1]);
        return { ok: true, status: 200, json: async () => ({ data: names.map((name) => ({ name, prices: { usd: "9.99" } })) }) };
      }
      const res = await scryfall(url, init);
      const json = await res.json();
      (json.data || []).forEach((c, i) => { if (i % 10 === 3 && !url.includes("/cards/collection")) c.prices = { usd: null, eur: null }; });
      return { ...res, json: async () => json };
    }));
    const budget = 120;
    const deck = await buildDeck(commander, "random", BRACKETS[2], { budget, priceSource: "usd" });
    expect(deckCost(deck) + 5).toBeLessThanOrEqual(budget);
    expect(allCards(deck).reduce((s, c) => s + c.qty, 0)).toBe(99);
  });

  it("builds the cheapest possible deck when the commander alone costs more than the budget", async () => {
    const pricey = { ...commander, priceUsd: "500.00" };
    const deck = await buildDeck(pricey, "random", BRACKETS[2], { budget: 100, priceSource: "usd" });
    expect(allCards(deck).reduce((s, c) => s + c.qty, 0)).toBe(99);
    // Each fake pool has one card at $0.25, one at $0.50 and so on, so the
    // cheapest n cards in a category all cost $0.25 x n or less.
    const price = (name) => parseFloat(deck.cardData[name.toLowerCase()].priceUsd);
    Object.entries(BRACKETS[2].recipe).forEach(([cat, n]) => {
      expect(Math.max(...deck.picks[cat].map((c) => price(c.name)))).toBeLessThanOrEqual(0.25 * n);
    });
  });

  describe("Game Changers", () => {
    // Flags the priciest few cards in every pool, lands included, as Game
    // Changers, and makes the Game Changer search fail so the flags are used.
    beforeEach(() => {
      const scryfall = fakeScryfall();
      vi.stubGlobal("fetch", vi.fn(async (url, init) => {
        if (url.includes("gamechanger")) return { ok: false, status: 500, json: async () => ({}) };
        const res = await scryfall(url, init);
        const json = await res.json();
        (json.data || []).forEach((c) => { c.game_changer = parseFloat(c.prices?.usd) >= 29; });
        return { ...res, json: async () => json };
      }));
    });
    const gameChangersIn = (deck) => deck.bracketCheck.gameChangers;

    it("runs up to three in bracket 3 when they're among the best picks", async () => {
      // With prices on and no budget, the priciest cards are picked first.
      const deck = await buildDeck(commander, "random", BRACKETS[2], { priceSource: "usd" });
      expect(gameChangersIn(deck)).toHaveLength(3);
      expect(allCards(deck).reduce((s, c) => s + c.qty, 0)).toBe(99);
    });

    it("runs none in bracket 2", async () => {
      const deck = await buildDeck(commander, "random", BRACKETS[1], { priceSource: "usd" });
      expect(gameChangersIn(deck)).toHaveLength(0);
      expect(allCards(deck).reduce((s, c) => s + c.qty, 0)).toBe(99);
    });
  });

  it("reports a network problem instead of returning an empty deck", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    await expect(buildDeck(commander, "random", BRACKETS[0])).rejects.toThrow(/no data/);
  });
});
