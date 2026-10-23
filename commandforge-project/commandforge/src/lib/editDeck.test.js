import { describe, it, expect } from "vitest";
import { addCard, deckHas, deckSize, evenOutWithBasics, removeCard } from "./editDeck";

const deck = () => ({
  commander: { name: "Kess, Dissident Mage", identity: ["U", "B", "R"] },
  picks: { ramp: [{ name: "Sol Ring" }], draw: [{ name: "Rhystic Study" }] },
  nonbasics: [{ name: "Command Tower", qty: 1 }],
  basics: [{ name: "Island", qty: 50 }, { name: "Swamp", qty: 46 }],
  alternatives: { ramp: ["Mind Stone", "Fellwar Stone"] },
  suggestions: { draw: ["Night's Whisper"] },
  bracketCheck: { gameChangers: [], extraTurns: [], combos: "clear" },
});

describe("deck editing", () => {
  it("counts the 99 with basics one by one", () => {
    expect(deckSize(deck())).toBe(99);
  });

  it("adds a card to its role and takes it off the suggestion lists", () => {
    const d = addCard(deck(), "Mind Stone", "ramp", { name: "Mind Stone" });
    expect(d.picks.ramp.map((c) => c.name)).toEqual(["Sol Ring", "Mind Stone"]);
    expect(d.alternatives.ramp).toEqual(["Fellwar Stone"]);
    expect(deckSize(d)).toBe(100);
    // The combo check only covered the deck as built.
    expect(d.bracketCheck.combos).toBe("edited");
    const s = addCard(deck(), "Night's Whisper", "draw");
    expect(s.suggestions).toEqual({});
  });

  it("files lands with the lands and keeps the deck singleton", () => {
    expect(addCard(deck(), "Watery Grave", "lands").nonbasics.map((l) => l.name)).toEqual(["Command Tower", "Watery Grave"]);
    expect(addCard(deck(), "Sol Ring", "ramp")).toEqual(deck());
    expect(addCard(deck(), "Kess, Dissident Mage", "synergy")).toEqual(deck());
    expect(addCard(deck(), "Island", "lands").basics[0]).toEqual({ name: "Island", qty: 51 });
  });

  it("keeps the bracket check's Game Changer list current", () => {
    const d = addCard(deck(), "Cyclonic Rift", "removal", { name: "Cyclonic Rift", gameChanger: true });
    expect(d.bracketCheck.gameChangers).toEqual(["Cyclonic Rift"]);
    expect(removeCard(d, "Cyclonic Rift").bracketCheck.gameChangers).toEqual([]);
  });

  it("cuts a card, or one copy of a basic", () => {
    expect(deckHas(removeCard(deck(), "Sol Ring"), "Sol Ring")).toBe(false);
    expect(removeCard(deck(), "Command Tower").nonbasics).toEqual([]);
    expect(removeCard(deck(), "Swamp").basics).toEqual([{ name: "Island", qty: 50 }, { name: "Swamp", qty: 45 }]);
  });

  it("evens the deck out to 99 with basics", () => {
    const over = addCard(addCard(deck(), "Mind Stone", "ramp"), "Fellwar Stone", "ramp");
    const trimmed = evenOutWithBasics(over, ["U", "B", "R"]);
    expect(deckSize(trimmed)).toBe(99);
    expect(trimmed.basics).toEqual([{ name: "Island", qty: 48 }, { name: "Swamp", qty: 46 }]);
    expect(trimmed.picks.ramp).toHaveLength(3);

    const under = removeCard(removeCard(deck(), "Sol Ring"), "Rhystic Study");
    const filled = evenOutWithBasics(under, ["U", "B", "R"]);
    expect(deckSize(filled)).toBe(99);
    // The scarcest basic first: the deck had no Mountains, so both are.
    expect(filled.basics.find((b) => b.name === "Mountain").qty).toBe(2);
  });
});
