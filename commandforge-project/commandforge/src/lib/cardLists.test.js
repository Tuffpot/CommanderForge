import { describe, it, expect, vi, afterEach } from "vitest";
import { forceIncludes, parseNameList, resolveIncludes, roleFor } from "./cardLists";

const deck = () => ({
  picks: {
    ramp: [{ name: "Sol Ring" }, { name: "Arcane Signet" }, { name: "Mind Stone" }],
    draw: [{ name: "Rhystic Study" }, { name: "Phyrexian Arena" }],
    synergy: [],
  },
  nonbasics: [{ name: "Command Tower", qty: 1 }],
  basics: [{ name: "Island", qty: 3 }, { name: "Swamp", qty: 2 }],
});
const size = (d) => Object.values(d.picks).flat().length + [...d.nonbasics, ...d.basics].reduce((s, l) => s + l.qty, 0);

describe("parseNameList", () => {
  it("reads one name per line, once each, without quantities or set codes", () => {
    expect(parseNameList("1 Sol Ring\nsol ring\n2x Rhystic Study (PLST) 123\n\nCyclonic Rift")).toEqual([
      "Sol Ring", "Rhystic Study", "Cyclonic Rift",
    ]);
    expect(parseNameList("")).toEqual([]);
  });
});

describe("roleFor", () => {
  it("guesses a card's job from its rules text", () => {
    expect(roleFor({ type_line: "Artifact", oracle_text: "{T}: Add {C}{C}." })).toBe("ramp");
    expect(roleFor({ type_line: "Instant", oracle_text: "Destroy target creature." })).toBe("removal");
    expect(roleFor({ type_line: "Land", oracle_text: "{T}: Add {U}." })).toBe("lands");
    expect(roleFor({ type_line: "Creature — Zombie", oracle_text: "Other Zombies you control get +1/+1." })).toBe("synergy");
  });
});

describe("forceIncludes", () => {
  it("puts a spell in place of its role's last pick", () => {
    const out = forceIncludes(deck(), [{ name: "Fellwar Stone", role: "ramp" }]);
    expect(out.picks.ramp.map((c) => c.name)).toEqual(["Sol Ring", "Arcane Signet", "Fellwar Stone"]);
    expect(out.cut).toEqual(["Mind Stone"]);
    expect(size(out)).toBe(size(deck()));
  });

  it("takes from the busiest role when its own has nothing to give up", () => {
    const out = forceIncludes(deck(), [{ name: "Zombie Lord", role: "synergy" }]);
    expect(out.picks.synergy).toEqual([{ name: "Zombie Lord" }]);
    expect(out.cut).toEqual(["Mind Stone"]);
  });

  it("puts a land in place of the most plentiful basic", () => {
    const out = forceIncludes(deck(), [{ name: "Watery Grave", role: "lands" }]);
    expect(out.nonbasics.map((l) => l.name)).toEqual(["Command Tower", "Watery Grave"]);
    expect(out.basics).toEqual([{ name: "Island", qty: 2 }, { name: "Swamp", qty: 2 }]);
    expect(size(out)).toBe(size(deck()));
  });

  it("never cuts one must-include for another, and leaves ones already in", () => {
    const out = forceIncludes(deck(), [
      { name: "Sol Ring", role: "ramp" },
      { name: "Fellwar Stone", role: "ramp" },
      { name: "Talisman of Dominance", role: "ramp", missing: true },
    ]);
    expect(out.picks.ramp).toEqual([{ name: "Sol Ring" }, { name: "Fellwar Stone" }, { name: "Talisman of Dominance", missing: true }]);
    expect(out.cut).toEqual(["Mind Stone", "Arcane Signet"]);
  });

  it("doesn't change the deck it's given", () => {
    const d = deck();
    forceIncludes(d, [{ name: "Fellwar Stone", role: "ramp" }, { name: "Watery Grave", role: "lands" }]);
    expect(d).toEqual(deck());
  });
});

describe("resolveIncludes", () => {
  afterEach(() => vi.unstubAllGlobals());
  const commander = { name: "Tasigur, the Golden Fang", identity: ["B"] };

  it("keeps the cards the commander can play and says why the rest can't go in", async () => {
    const cards = [
      { name: "Sol Ring", type_line: "Artifact", oracle_text: "{T}: Add {C}{C}.", color_identity: [], legalities: { commander: "banned" } },
      { name: "Phyrexian Arena", type_line: "Enchantment", oracle_text: "At the beginning of your upkeep, you draw a card and you lose 1 life.", color_identity: ["B"], legalities: { commander: "legal" } },
      { name: "Counterspell", type_line: "Instant", oracle_text: "Counter target spell.", color_identity: ["U"], legalities: { commander: "legal" } },
      { name: "Swamp", type_line: "Basic Land — Swamp", color_identity: ["B"], legalities: { commander: "legal" } },
      { name: "Bloodline Keeper // Lord of Lineage", type_line: "Creature — Vampire", card_faces: [{ type_line: "Creature — Vampire", oracle_text: "Flying" }], color_identity: ["B"], legalities: { commander: "legal" } },
    ];
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: cards }) })));
    const out = await resolveIncludes(["Sol Ring", "Phyrexian Arena", "Counterspell", "Swamp", "Bloodline Keeper", "Not A Card"], commander);
    expect(out.cards.map((c) => [c.name, c.role])).toEqual([
      ["Phyrexian Arena", "draw"],
      ["Bloodline Keeper // Lord of Lineage", "synergy"],
    ]);
    expect(out.cards[0].data.name).toBe("Phyrexian Arena");
    expect(out.issues).toEqual([
      { name: "Sol Ring", reason: "not-legal" },
      { name: "Counterspell", reason: "off-colour" },
      { name: "Swamp", reason: "basic" },
      { name: "Not A Card", reason: "not-found" },
    ]);
  });

  it("asks Scryfall nothing for an empty list", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await resolveIncludes([], commander)).toEqual({ cards: [], issues: [] });
    expect(fetch).not.toHaveBeenCalled();
  });
});
