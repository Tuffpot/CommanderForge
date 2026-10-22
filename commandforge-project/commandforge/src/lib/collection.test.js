import { describe, it, expect, vi, afterEach } from "vitest";
import {
  parseCollectionText, mergeEntries, fetchCollectionCards, canBeCommander, CATEGORY_TESTS, fullText, playableCount,
} from "./collection";
import { buildDeckFromCollection } from "./buildFromCollection";
import { BRACKETS } from "./buildDeck";

const MANABOX_CSV = [
  "Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,ManaBox ID,Scryfall ID,Purchase price,Misprint,Altered,Condition,Language,Purchase price currency",
  'Sol Ring,C21,Commander 2021,263,normal,uncommon,2,1,aaa-111,1.5,false,false,near_mint,en,USD',
  '"Kenrith, the Returned King",ELD,Throne of Eldraine,303,foil,mythic,1,2,bbb-222,4,false,false,near_mint,en,USD',
].join("\n");

describe("parseCollectionText", () => {
  it("reads a ManaBox CSV export, names with commas included", () => {
    expect(parseCollectionText(MANABOX_CSV)).toEqual([
      { name: "Sol Ring", qty: 2, scryfallId: "aaa-111" },
      { name: "Kenrith, the Returned King", qty: 1, scryfallId: "bbb-222" },
    ]);
  });

  it("reads pasted lists in the usual formats", () => {
    const text = "Commander\n1 Sol Ring\n2x Island\nCultivate\n1 Arcane Signet (CMR) 297\n1 Lightning Bolt [M10] *F*\n// note\n";
    expect(parseCollectionText(text).map((e) => [e.qty, e.name])).toEqual([
      [1, "Sol Ring"], [2, "Island"], [1, "Cultivate"], [1, "Arcane Signet"], [1, "Lightning Bolt"],
    ]);
  });

  it("adds up the same card across lines and imports", () => {
    expect(mergeEntries([{ name: "Sol Ring", qty: 1 }], [{ name: "sol ring", qty: 2 }, { name: "Island", qty: 4 }]))
      .toEqual([{ name: "Island", qty: 4 }, { name: "Sol Ring", qty: 3 }]);
  });
});

describe("fetchCollectionCards", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses Scryfall's names and reports the ones it couldn't find", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [{ name: "Fire // Ice" }, { name: "Sol Ring" }],
        not_found: [{ name: "Not A Card" }],
      }),
    })));
    const result = await fetchCollectionCards([
      { name: "Fire", qty: 1 }, { name: "Not A Card", qty: 1 }, { name: "Sol Ring", qty: 2, scryfallId: null },
    ]);
    expect(result.entries).toEqual([{ name: "Fire // Ice", qty: 1 }, { name: "Sol Ring", qty: 2 }]);
    expect(result.notFound).toEqual(["Not A Card"]);
    expect(Object.keys(result.cards)).toEqual(["fire // ice", "sol ring"]);
  });
});

describe("card roles", () => {
  const card = (oracle_text, extra = {}) => ({ name: "X", type_line: "Instant", oracle_text, ...extra });
  const is = (cat, c) => CATEGORY_TESTS[cat](c, fullText(c));

  it("spots the main roles from rules text", () => {
    expect(is("ramp", card("Search your library for up to two basic land cards"))).toBe(true);
    expect(is("ramp", { name: "Sol Ring", type_line: "Artifact", oracle_text: "{T}: Add {C}{C}.", produced_mana: ["C"] })).toBe(true);
    expect(is("draw", card("Draw two cards."))).toBe(true);
    expect(is("removal", card("Exile target creature. Its controller gains life equal to its power."))).toBe(true);
    expect(is("protection", card("Creatures you control gain indestructible until end of turn."))).toBe(true);
    expect(is("removal", card("Draw two cards."))).toBe(false);
  });

  it("recognises commanders", () => {
    expect(canBeCommander({ type_line: "Legendary Creature — Elf", legalities: { commander: "legal" } })).toBe(true);
    expect(canBeCommander({ type_line: "Creature — Elf", legalities: { commander: "legal" } })).toBe(false);
    expect(canBeCommander({ type_line: "Legendary Creature — Elf", legalities: { commander: "banned" } })).toBe(false);
  });
});

// A made-up collection: `n` cards of each role in each colour, plus lands.
function collection(n) {
  const cards = {};
  const add = (name, color, oracle_text, type_line = "Sorcery", extra = {}) => {
    cards[name.toLowerCase()] = {
      name, type_line, oracle_text, color_identity: color ? [color] : [], legalities: { commander: "legal" },
      edhrec_rank: Object.keys(cards).length + 1, prices: { usd: "1.00" }, ...extra,
    };
  };
  ["G", "U", "R"].forEach((color) => {
    for (let i = 0; i < n; i++) {
      add(`Ramp ${color}${i}`, color, "Search your library for a basic land card");
      add(`Draw ${color}${i}`, color, "Draw two cards.");
      add(`Kill ${color}${i}`, color, "Destroy target creature.");
      add(`Shield ${color}${i}`, color, "Target creature gains hexproof until end of turn.");
      add(`Bear ${color}${i}`, color, "", "Creature — Bear");
    }
  });
  for (let i = 0; i < 20; i++) add(`Dual ${i}`, null, "", "Land", { produced_mana: ["G", "U"] });
  add("Forest", null, "", "Basic Land — Forest");
  add("Simic Boss", "G", "", "Legendary Creature — Merfolk", { color_identity: ["G", "U"] });
  return cards;
}

const commander = { name: "Simic Boss", identity: ["G", "U"], archetype: null };

function deckSize(deck) {
  return [...Object.values(deck.picks).flat().map(() => 1), ...deck.nonbasics.map((l) => l.qty), ...deck.basics.map((l) => l.qty)]
    .reduce((s, q) => s + q, 0);
}

describe("buildDeckFromCollection", () => {
  afterEach(() => vi.unstubAllGlobals());

  // Scryfall stand-in for the suggestions and basics: every search returns
  // a few cards the collection doesn't have.
  function fakeScryfall() {
    return vi.fn(async (url) => {
      if (url.includes("/cards/collection")) return { ok: true, json: async () => ({ data: [] }) };
      const q = decodeURIComponent(new URL(url).searchParams.get("q"));
      const tag = q.replace(/[^a-z]/gi, "").slice(-12);
      const data = Array.from({ length: 40 }, (_, i) => ({ name: `Shop ${tag} ${i}`, prices: {} }));
      return { ok: true, status: 200, json: async () => ({ data }) };
    });
  }

  it("builds 99 cards using only owned cards in the commander's colours", async () => {
    vi.stubGlobal("fetch", fakeScryfall());
    const owned = collection(20);
    const deck = await buildDeckFromCollection(commander, "edhrec", BRACKETS[2], owned);
    expect(deckSize(deck)).toBe(99);
    const spells = Object.values(deck.picks).flat();
    expect(spells.every((c) => owned[c.name.toLowerCase()])).toBe(true);
    expect(spells.some((c) => c.name.includes(" R"))).toBe(false);
    expect(new Set(spells.map((c) => c.name)).size).toBe(spells.length);
    expect(deck.picks.ramp).toHaveLength(BRACKETS[2].recipe.ramp);
    expect(deck.nonbasics.every((l) => l.name.startsWith("Dual"))).toBe(true);
    expect(deck.missingCount).toBe(0);
  });

  it("fills short roles with other owned cards and suggests what to buy", async () => {
    vi.stubGlobal("fetch", fakeScryfall());
    const owned = collection(20);
    // Only two ramp spells in the commander's colours.
    Object.keys(owned).filter((k) => /^ramp (u|g([2-9]|1\d)$)/.test(k)).forEach((k) => delete owned[k]);
    const deck = await buildDeckFromCollection(commander, "edhrec", BRACKETS[2], owned);
    expect(deck.picks.ramp).toHaveLength(2);
    expect(deck.shortRoles.ramp).toEqual({ have: 2, want: BRACKETS[2].recipe.ramp });
    expect(deck.suggestions.ramp).toHaveLength(5);
    expect(deck.missingCount).toBe(0);
    expect(deckSize(deck)).toBe(99);
  });

  it("marks the cards the person needs when the collection is too small", async () => {
    vi.stubGlobal("fetch", fakeScryfall());
    const owned = collection(3);
    const deck = await buildDeckFromCollection(commander, "edhrec", BRACKETS[1], owned);
    expect(deckSize(deck)).toBe(99);
    const missing = Object.values(deck.picks).flat().filter((c) => c.missing);
    expect(missing.length).toBe(deck.missingCount);
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.every((c) => !owned[c.name.toLowerCase()])).toBe(true);
  });

  it("counts the cards a commander could play", () => {
    expect(playableCount({ name: "Simic Boss", color_identity: ["G", "U"] }, collection(1))).toBe(10 + 20);
  });
});
