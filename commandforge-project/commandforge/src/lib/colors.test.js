import { describe, it, expect } from "vitest";
import { houseNameForColors } from "./colors";
import { describeDeck } from "./describeDeck";

describe("houseNameForColors", () => {
  it("names guilds and shards whatever order the colours come in", () => {
    expect(houseNameForColors(["U", "W"])).toBe("Azorius");
    expect(houseNameForColors(["R", "U", "B"])).toBe("Grixis");
  });

  it("names mono, colourless, four- and five-colour identities", () => {
    expect(houseNameForColors(["G"])).toBe("Mono-Green");
    expect(houseNameForColors(["C"])).toBe("Colorless");
    expect(houseNameForColors(["U", "B", "R", "G"])).toBe("Glint (non-White)");
    expect(houseNameForColors(["W", "U", "B", "R", "G"])).toBe("5-Color / Big Mana");
    expect(houseNameForColors([])).toBeNull();
  });
});

describe("describeDeck", () => {
  const base = {
    commander: { name: "Edgar Markov", identity: ["W", "B", "R"], archetype: "tokens" },
    bracket: { id: 2, name: "Core" },
  };

  it("names the style, commander, bracket and colours", () => {
    const text = describeDeck({ ...base, style: "edhrec" });
    expect(text).toMatch(/^An EDHREC-inspired build around Edgar Markov, aimed at Bracket 2 \(Core\) power level in Mardu colors\./);
    expect(text).toContain("token creatures");
  });

  it("prefers a typed theme over the guessed archetype", () => {
    expect(describeDeck({ ...base, style: "edhrec", theme: "Lifegain" })).toContain("gains large amounts of life");
    expect(describeDeck({ ...base, style: "edhrec", theme: "Vampires" })).toContain("a vampires gameplan");
  });

  it("returns nothing without a deck", () => {
    expect(describeDeck(null)).toBe("");
  });
});
