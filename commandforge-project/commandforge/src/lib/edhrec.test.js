import { describe, expect, it } from "vitest";
import { edhrecFirst, edhrecRanks } from "./edhrec";
import { cardsFrom, edhrecSlug } from "../../netlify/functions/edhrec.mjs";

describe("edhrecSlug", () => {
  it("matches EDHREC's page names", () => {
    expect(edhrecSlug("Atraxa, Praetors' Voice")).toBe("atraxa-praetors-voice");
    expect(edhrecSlug("Sephiroth, Fabled SOLDIER")).toBe("sephiroth-fabled-soldier");
    expect(edhrecSlug("Lim-Dûl the Necromancer")).toBe("lim-dul-the-necromancer");
    expect(edhrecSlug("Esika, God of the Tree // The Prismatic Bridge")).toBe("esika-god-of-the-tree");
  });
});

describe("cardsFrom", () => {
  it("lists each card once with the share of decks that run it, most played first", () => {
    const json = {
      num_decks_avg: 1000,
      container: { json_dict: { cardlists: [
        { header: "High Synergy Cards", cardviews: [{ name: "Bitterblossom", inclusion: 300, potential_decks: 1000, synergy: 0.4 }] },
        { header: "Top Cards", cardviews: [{ name: "Sol Ring", inclusion: 950, potential_decks: 1000 }, { name: "Bitterblossom", inclusion: 300, potential_decks: 1000 }] },
        { header: "Lands", cardviews: [{ name: "Cabal Coffers", num_decks: 600 }] },
      ] } },
    };
    expect(cardsFrom(json)).toEqual([
      { name: "Sol Ring", share: 0.95, synergy: null },
      { name: "Cabal Coffers", share: 0.6, synergy: null },
      { name: "Bitterblossom", share: 0.3, synergy: 0.4 },
    ]);
  });

  it("copes with a page that isn't what it expected", () => {
    expect(cardsFrom(null)).toEqual([]);
    expect(cardsFrom({ container: {} })).toEqual([]);
  });
});

describe("edhrecRanks and edhrecFirst", () => {
  const ranks = edhrecRanks([
    { name: "Sol Ring", share: 0.95 },
    { name: "Bitterblossom", share: 0.3 },
    { name: "Pet Card", share: 0.02 },
  ]);

  it("ranks cards played in enough decks, leaving out pet cards", () => {
    expect([...ranks.keys()]).toEqual(["sol ring", "bitterblossom"]);
  });

  it("puts played cards first, most played first, and keeps the rest in order", () => {
    const list = ["Divination", "Bitterblossom", "Pet Card", "Sol Ring"].map((name) => ({ name }));
    expect(edhrecFirst(list, ranks).map((c) => c.name)).toEqual(["Sol Ring", "Bitterblossom", "Divination", "Pet Card"]);
    expect(edhrecFirst(list, new Map())).toBe(list);
  });
});
