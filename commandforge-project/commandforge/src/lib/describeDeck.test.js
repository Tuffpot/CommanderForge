import { describe, it, expect } from "vitest";
import { commanderFacts, shortCommanderName, strategyBlurb } from "./describeDeck";
import { guessArchetype } from "./queries";

const commander = (name, oracleText) => ({ name, oracleText, identity: [], archetype: guessArchetype(oracleText) });

const KRENKO = commander("Krenko, Mob Boss", "{T}: Create X 1/1 red Goblin creature tokens, where X is the number of Goblins you control.");
const TALRAND = commander("Talrand, Sky Summoner", "Flying\nWhenever you cast an instant or sorcery spell, create a 2/2 blue Drake creature token with flying.");
const OLORO = commander("Oloro, Ageless Ascetic", "At the beginning of your upkeep, you gain 2 life.\nWhenever you gain life, you may pay {1}. If you do, draw a card and each opponent loses 1 life.");
const LATHRIL = commander("Lathril, Blade of the Elves", "Menace\nWhenever Lathril, Blade of the Elves deals combat damage to a player, create that many 1/1 green Elf Warrior creature tokens.\n{T}, Tap ten untapped Elves you control: Each opponent loses 10 life and you gain 10 life.");

describe("shortCommanderName", () => {
  it("drops the epithet and the back face", () => {
    expect(shortCommanderName("Krenko, Mob Boss")).toBe("Krenko");
    expect(shortCommanderName("Esika, God of the Tree // The Prismatic Bridge")).toBe("Esika");
    expect(shortCommanderName("Edgar Markov")).toBe("Edgar Markov");
  });
});

describe("commanderFacts", () => {
  it("reads the token, tribe, payoff and trigger from the card text", () => {
    expect(commanderFacts(KRENKO)).toMatchObject({ tokenType: "Goblin", tribe: "Goblin" });
    expect(commanderFacts(LATHRIL)).toMatchObject({ tokenType: "Elf Warrior", tribe: "Elf", trigger: "combat", evasive: true });
    expect(commanderFacts(OLORO)).toMatchObject({ payoff: "drain" });
  });

  it("copes with a commander that has no card text", () => {
    expect(commanderFacts({ name: "Krenko, Mob Boss", oracleText: null })).toMatchObject({ tokenType: null, payoff: null });
  });
});

describe("strategyBlurb", () => {
  it("writes the same archetype differently for each commander", () => {
    expect(strategyBlurb({ commander: KRENKO })).toBe("Krenko churns out Goblin tokens, and the deck goes wide around them for one big combined attack.");
    expect(strategyBlurb({ commander: TALRAND })).toBe("Talrand churns out Drake tokens every time you cast an instant or sorcery spell, and the deck goes wide around them for one big combined attack.");
    expect(strategyBlurb({ commander: LATHRIL })).toContain("Elf Warrior tokens whenever it connects");
  });

  it("says what the commander rewards you with", () => {
    expect(strategyBlurb({ commander: OLORO })).toMatch(/^Oloro drains every opponent whenever you gain life/);
  });

  it("names the commander without crediting it abilities when the theme is something else", () => {
    expect(strategyBlurb({ commander: KRENKO, theme: "Lifegain" })).toMatch(/^With Krenko at the helm, the deck gains/);
    expect(strategyBlurb({ commander: KRENKO, theme: "Angels" })).toBe("With Krenko at the helm, the deck leans into an angels gameplan, built around cards that reinforce that theme.");
  });

  it("treats a typed tribe the commander already makes as its own plan", () => {
    expect(strategyBlurb({ commander: KRENKO, theme: "Goblins" })).toMatch(/^Krenko churns out Goblin tokens/);
    expect(strategyBlurb({ commander: LATHRIL, theme: "Elves" })).toMatch(/^Lathril churns out Elf Warrior tokens/);
  });

  it("finds a plan for commanders outside the curated archetypes", () => {
    expect(strategyBlurb({ commander: commander("The Ur-Dragon", "Eminence — As long as The Ur-Dragon is in the command zone or on the battlefield, other Dragon spells you cast cost {1} less to cast.\nFlying") }))
      .toMatch(/^The Ur-Dragon leads a Dragon army/);
    expect(strategyBlurb({ commander: commander("Sythis, Harvest's Hand", "Whenever you cast an enchantment spell, you gain 1 life and draw a card.") }))
      .toMatch(/^Sythis draws you cards every time you cast an enchantment spell/);
    expect(strategyBlurb({ commander: { name: "Krenko, Mob Boss", oracleText: null, archetype: null } }))
      .toMatch(/^Krenko anchors a flexible, value-driven game/);
  });

  it("explains card advantage for newer players", () => {
    expect(strategyBlurb({ commander: { name: "Krenko, Mob Boss", oracleText: null, archetype: null } }))
      .toContain("card advantage (more cards in hand and on the board than your opponents).");
  });
});
