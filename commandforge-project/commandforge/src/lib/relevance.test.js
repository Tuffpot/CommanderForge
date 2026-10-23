import { describe, expect, it } from "vitest";
import { dropIrrelevant, relevanceCheck } from "./relevance";

const forge = {
  name: "Mystic Forge",
  typeLine: "Artifact",
  oracleText: "You may look at the top card of your library any time.\nYou may cast artifact spells and colorless spells from the top of your library.\n{T}, Pay 1 life: Exile the top card of your library.",
};
const lord = { name: "Elvish Archdruid", typeLine: "Creature — Elf Druid", oracleText: "Other Elf creatures you control get +1/+1.\n{T}: Add {G} for each Elf you control." };
const rhystic = { name: "Rhystic Study", typeLine: "Enchantment", oracleText: "Whenever an opponent casts a spell, you may draw a card unless that player pays {1}." };
const sephiroth = { name: "Sephiroth, Fabled SOLDIER", typeLine: "Legendary Creature — Human Avatar Soldier", oracleText: "Whenever Sephiroth enters or attacks, you may sacrifice another creature. If you do, draw a card." };
const filler = (n, typeLine) => Array.from({ length: n }, (_, i) => ({ name: `${typeLine} ${i}`, typeLine, oracleText: "" }));

describe("relevanceCheck", () => {
  it("rejects Mystic Forge in a deck with only a few artifacts", () => {
    const fits = relevanceCheck(sephiroth, [forge, ...filler(8, "Artifact"), ...filler(40, "Creature — Zombie")]);
    expect(fits(forge)).toBe(false);
  });

  it("keeps it in an artifact deck", () => {
    expect(relevanceCheck(sephiroth, [forge, ...filler(16, "Artifact")])(forge)).toBe(true);
  });

  it("keeps a payoff the commander shares", () => {
    const urza = { name: "Urza", typeLine: "Legendary Creature — Human Artificer", oracleText: "Artifact spells you cast cost {1} less." };
    expect(relevanceCheck(urza, [forge])(forge)).toBe(true);
  });

  it("wants enough of a creature type for a lord", () => {
    expect(relevanceCheck(sephiroth, [lord, ...filler(3, "Creature — Elf")])(lord)).toBe(false);
    expect(relevanceCheck(sephiroth, [lord, ...filler(10, "Creature — Elf Warrior")])(lord)).toBe(true);
  });

  it("leaves cards that work anywhere alone", () => {
    expect(relevanceCheck(sephiroth, [rhystic])(rhystic)).toBe(true);
    const wildspeaker = { name: "Return of the Wildspeaker", typeLine: "Instant", oracleText: "Choose one —\n• Draw cards equal to the greatest power among non-Human creatures you control.\n• Non-Human creatures you control get +3/+3 until end of turn." };
    const boots = { name: "Swiftfoot Boots", typeLine: "Artifact — Equipment", oracleText: "Equipped creature has hexproof and haste.\nEquip {1}" };
    const elfCommander = { ...sephiroth, typeLine: "Legendary Creature — Elf" };
    expect(relevanceCheck(elfCommander, [wildspeaker, boots])(wildspeaker)).toBe(true);
    expect(relevanceCheck(elfCommander, [boots])(boots)).toBe(true);
  });
});

describe("dropIrrelevant", () => {
  it("swaps an off-theme card for the next one in its role that fits", () => {
    const picks = { draw: [forge, rhystic], synergy: filler(30, "Creature — Zombie") };
    const cardData = Object.fromEntries([forge, rhystic, lord].map((c) => [c.name.toLowerCase(), c]));
    const pool = [forge, rhystic, lord, { name: "Phyrexian Arena", typeLine: "Enchantment", oracleText: "At the beginning of your upkeep, you draw a card and you lose 1 life." }];
    const { picks: next, swaps } = dropIrrelevant(picks, sephiroth, cardData, () => pool);
    expect(next.draw.map((c) => c.name)).toEqual(["Phyrexian Arena", "Rhystic Study"]);
    expect(swaps).toHaveLength(1);
  });
});
