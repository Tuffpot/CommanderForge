import { describe, expect, it } from "vitest";
import { archidektList, cardmarketList, moxfieldList, neededList } from "./exportDeck";

const picks = {
  ramp: [{ name: "Sol Ring" }, { name: "Arcane Signet" }],
  removal: [{ name: "Swords to Plowshares" }],
};
const nonbasics = [{ name: "Command Tower", qty: 1 }];
const basics = [{ name: "Plains", qty: 10 }];

describe("moxfieldList", () => {
  it("puts the commander first and includes every card, basics too", () => {
    expect(moxfieldList("Atraxa, Praetors' Voice", picks, nonbasics, basics).split("\n")).toEqual([
      "1 Atraxa, Praetors' Voice",
      "1 Sol Ring",
      "1 Arcane Signet",
      "1 Swords to Plowshares",
      "1 Command Tower",
      "10 Plains",
    ]);
  });
});

describe("archidektList", () => {
  it("tags the commander for the command zone and sorts cards by role", () => {
    expect(archidektList("Atraxa, Praetors' Voice", picks, nonbasics, basics).split("\n")).toEqual([
      "1x Atraxa, Praetors' Voice [Commander{top}]",
      "1x Sol Ring [Ramp]",
      "1x Arcane Signet [Ramp]",
      "1x Swords to Plowshares [Removal and Interaction]",
      "1x Command Tower [Land]",
      "10x Plains [Land]",
    ]);
  });
});

describe("cardmarketList", () => {
  it("leaves basic lands out", () => {
    expect(cardmarketList("Atraxa, Praetors' Voice", picks, nonbasics)).not.toContain("Plains");
  });
});

describe("neededList", () => {
  it("lists only missing cards, the commander if unowned, and suggestions", () => {
    const deck = {
      commander: { name: "Krenko, Mob Boss" },
      commanderOwned: false,
      picks: { ramp: [{ name: "Sol Ring", missing: true }, { name: "Mind Stone" }] },
      suggestions: { draw: ["Skullclamp"] },
    };
    expect(neededList(deck).split("\n")).toEqual(["1 Krenko, Mob Boss", "1 Sol Ring", "1 Skullclamp"]);
  });
});
