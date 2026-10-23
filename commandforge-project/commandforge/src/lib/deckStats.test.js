import { describe, expect, it } from "vitest";
import { deckStats } from "./deckStats";

describe("deckStats", () => {
  const cardData = {
    "sol ring": { cmc: 1, typeLine: "Artifact" },
    "llanowar elves": { cmc: 1, typeLine: "Creature — Elf Druid" },
    "solemn simulacrum": { cmc: 4, typeLine: "Artifact Creature — Golem" },
    "blightsteel colossus": { cmc: 12, typeLine: "Artifact Creature — Phyrexian Golem" },
    "cultivate": { cmc: 3, typeLine: "Sorcery" },
  };
  const picks = {
    ramp: [{ name: "Sol Ring" }, { name: "Llanowar Elves" }, { name: "Cultivate" }, { name: "Mystery Card" }],
    wincon: [{ name: "Solemn Simulacrum" }, { name: "Blightsteel Colossus" }],
  };

  it("buckets mana values, putting 7 and up together", () => {
    expect(deckStats(picks, cardData).curve).toEqual([0, 2, 0, 1, 1, 0, 0, 1]);
  });

  it("counts artifact creatures as creatures and skips cards with no data", () => {
    const stats = deckStats(picks, cardData);
    expect(stats.counted).toBe(5);
    expect(stats.types).toEqual([["Creature", 3], ["Artifact", 1], ["Sorcery", 1]]);
    expect(stats.average).toBeCloseTo(21 / 5);
  });
});
