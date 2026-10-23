import { describe, expect, it } from "vitest";
import { applyBracketLimits, bracketLimits, breakCombos, capPicks, isExtraTurn, twoCardCombosFrom } from "./bracketRules";

const card = (name, oracleText = "") => ({ name, oracleText });
const gc = new Set(["rhystic study", "cyclonic rift", "demonic tutor", "smothering tithe", "gaea's cradle"]);

describe("bracketLimits", () => {
  it("follows the official table", () => {
    expect(bracketLimits(1)).toEqual({ gameChangers: 0, extraTurns: 0, massLandDenial: false, twoCardCombos: false });
    expect(bracketLimits(2).gameChangers).toBe(0);
    expect(bracketLimits(2).extraTurns).toBe(1);
    expect(bracketLimits(3).gameChangers).toBe(3);
    expect(bracketLimits(4).gameChangers).toBe(Infinity);
    expect(bracketLimits(5).massLandDenial).toBe(true);
  });
});

describe("applyBracketLimits", () => {
  const draw = [card("Rhystic Study"), card("Harmonize")];
  const removal = [card("Cyclonic Rift"), card("Demonic Tutor"), card("Armageddon"), card("Swords to Plowshares")];
  const lands = [card("Gaea's Cradle"), card("Command Tower")];

  it("drops every Game Changer and mass land denial card in bracket 2", () => {
    const [d, r, l] = applyBracketLimits([draw, removal, lands], bracketLimits(2), gc);
    expect([...d, ...r, ...l].map((c) => c.name)).toEqual(["Harmonize", "Swords to Plowshares", "Command Tower"]);
  });

  it("keeps only the first three Game Changers across all pools in bracket 3", () => {
    const [d, r, l] = applyBracketLimits([draw, removal, lands], bracketLimits(3), gc);
    expect([...d, ...r, ...l].filter((c) => gc.has(c.name.toLowerCase())).map((c) => c.name))
      .toEqual(["Rhystic Study", "Cyclonic Rift", "Demonic Tutor"]);
  });

  it("counts a Game Changer commander toward the three", () => {
    const [d, r] = applyBracketLimits([draw, removal], bracketLimits(3), gc, { gameChangersUsed: 1 });
    expect([...d, ...r].filter((c) => gc.has(c.name.toLowerCase()))).toHaveLength(2);
  });

  it("allows one extra-turn card in brackets 2 and 3, none in 1, any in 4", () => {
    const turns = [card("Time Warp", "Target player takes an extra turn after this one."), card("Temporal Manipulation", "Take an extra turn after this one.")];
    expect(applyBracketLimits([turns], bracketLimits(1), gc)[0]).toHaveLength(0);
    expect(applyBracketLimits([turns], bracketLimits(2), gc)[0]).toHaveLength(1);
    expect(applyBracketLimits([turns], bracketLimits(4), gc)[0]).toHaveLength(2);
  });

  it("leaves bracket 4 alone", () => {
    const [r] = applyBracketLimits([removal], bracketLimits(4), gc);
    expect(r).toHaveLength(4);
  });
});

describe("capPicks", () => {
  const picks = {
    lands: [card("Command Tower")],
    draw: [card("Rhystic Study"), card("Harmonize")],
    removal: [card("Cyclonic Rift"), card("Demonic Tutor"), card("Smothering Tithe")],
  };
  const spares = { draw: [card("Rhystic Study"), card("Divination")], removal: [card("Gaea's Cradle"), card("Swords to Plowshares")] };
  const replacementsFor = (role) => spares[role] || [];

  it("keeps the first three Game Changers the deck picked in bracket 3 and swaps the rest", () => {
    const { picks: next, swaps } = capPicks(picks, bracketLimits(3), gc, { replacementsFor });
    expect(next.removal.map((c) => c.name)).toEqual(["Cyclonic Rift", "Demonic Tutor", "Swords to Plowshares"]);
    expect(swaps.map((s) => [s.from.name, s.to?.name])).toEqual([["Smothering Tithe", "Swords to Plowshares"]]);
  });

  it("swaps out every Game Changer in bracket 2, never for another, and drops one with no swap", () => {
    const { picks: next } = capPicks(picks, bracketLimits(2), gc, { replacementsFor });
    expect(next.draw.map((c) => c.name)).toEqual(["Divination", "Harmonize"]);
    expect(next.removal.map((c) => c.name)).toEqual(["Swords to Plowshares"]);
  });

  it("counts a Game Changer commander toward the three", () => {
    const { swaps } = capPicks(picks, bracketLimits(3), gc, { gameChangersUsed: 1, replacementsFor });
    expect(swaps.map((s) => s.from.name)).toEqual(["Demonic Tutor", "Smothering Tithe"]);
  });

  it("leaves bracket 4 alone", () => {
    expect(capPicks(picks, bracketLimits(4), gc).swaps).toHaveLength(0);
  });
});

describe("isExtraTurn", () => {
  it("spots extra-turn text and ignores the rest", () => {
    expect(isExtraTurn({ oracleText: "Take an extra turn after this one." })).toBe(true);
    expect(isExtraTurn({ oracle_text: "Target player takes an extra turn." })).toBe(true);
    expect(isExtraTurn({ oracleText: "Draw two cards." })).toBe(false);
  });
});

describe("twoCardCombosFrom", () => {
  it("keeps only combos of exactly two cards", () => {
    const json = { results: { included: [
      { uses: [{ card: { name: "Thassa's Oracle" } }, { card: { name: "Demonic Consultation" } }] },
      { uses: [{ card: { name: "A" } }, { card: { name: "B" } }, { card: { name: "C" } }] },
    ] } };
    expect(twoCardCombosFrom(json)).toEqual([["Thassa's Oracle", "Demonic Consultation"]]);
  });

  it("copes with an unexpected reply", () => {
    expect(twoCardCombosFrom(null)).toEqual([]);
    expect(twoCardCombosFrom({ results: {} })).toEqual([]);
  });
});

describe("breakCombos", () => {
  it("swaps one card of each combo for a non-combo alternative in the same role", () => {
    const picks = { wincon: [{ name: "Thassa's Oracle" }, { name: "Craterhoof Behemoth" }], draw: [{ name: "Demonic Consultation" }] };
    const { picks: out, removed } = breakCombos(
      picks,
      [["Thassa's Oracle", "Demonic Consultation"]],
      { wincon: ["Craterhoof Behemoth", "Demonic Consultation", "Torment of Hailfire"] },
      "Kinnan, Bonder Prodigy"
    );
    expect(removed).toEqual(["Thassa's Oracle"]);
    expect(out.wincon.map((c) => c.name)).toEqual(["Torment of Hailfire", "Craterhoof Behemoth"]);
    expect(out.draw.map((c) => c.name)).toEqual(["Demonic Consultation"]);
  });

  it("never removes a card it's told to keep", () => {
    const picks = { wincon: [{ name: "Thassa's Oracle" }], draw: [{ name: "Demonic Consultation" }] };
    const { removed } = breakCombos(
      picks,
      [["Thassa's Oracle", "Demonic Consultation"]],
      { draw: ["Night's Whisper"] },
      "Kinnan, Bonder Prodigy",
      new Set(["thassa's oracle"])
    );
    expect(removed).toEqual(["Demonic Consultation"]);
  });

  it("never removes the commander", () => {
    const picks = { synergy: [{ name: "Curiosity" }] };
    const { picks: out, removed } = breakCombos(picks, [["Niv-Mizzet, Parun", "Curiosity"]], { synergy: ["Opt"] }, "Niv-Mizzet, Parun");
    expect(removed).toEqual(["Curiosity"]);
    expect(out.synergy.map((c) => c.name)).toEqual(["Opt"]);
  });
});
