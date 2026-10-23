import { describe, it, expect } from "vitest";
import {
  guessArchetype, buildNameQuery, filterAndSortByName, buildColorQuery, normalizeThemeKey,
  singularType, resolveThemeQuery, categoryQuery, nonbasicTarget, fixesFor, isFetchLand, limitFetchLands, ARCHETYPE_QUERIES,
} from "./queries";

describe("guessArchetype", () => {
  it("spots a theme from rules text", () => {
    expect(guessArchetype("Whenever you gain life, put a +1/+1 counter on target creature.")).toBe("counters");
    expect(guessArchetype("Ninjutsu {1}{U}")).toBe("ninjas");
  });

  it("returns null when nothing matches", () => {
    expect(guessArchetype("Flying")).toBeNull();
    expect(guessArchetype(null)).toBeNull();
  });
});

describe("buildNameQuery", () => {
  it("searches the name field only, without stray quotes", () => {
    expect(buildNameQuery('  Atraxa "Grand" ')).toBe('is:commander name:"Atraxa Grand"');
  });

  it("falls back to every commander when empty", () => {
    expect(buildNameQuery("   ")).toBe("is:commander");
  });
});

describe("filterAndSortByName", () => {
  const cards = ["Kenrith, the Returned King", "Edgar Markov", "Ken, Rogue", "Ugin"].map((name) => ({ name }));

  it("keeps matches only, with names starting with the search first", () => {
    expect(filterAndSortByName(cards, "ken").map((c) => c.name)).toEqual(["Ken, Rogue", "Kenrith, the Returned King"]);
  });

  it("returns everything for an empty search", () => {
    expect(filterAndSortByName(cards, " ")).toBe(cards);
  });
});

describe("buildColorQuery", () => {
  it("uses the picked colours", () => {
    expect(buildColorQuery(["W", "U"], "", "")).toBe("is:commander id=wu");
  });

  it("lets a typed house name win over the colour buttons", () => {
    expect(buildColorQuery(["W"], " Grixis ", "")).toBe("is:commander id=ubr");
    expect(buildColorQuery([], "colourless", "")).toBe("is:commander id=c");
  });

  it("adds a theme search when one is typed", () => {
    expect(buildColorQuery([], "", "tokens")).toBe(`is:commander ${ARCHETYPE_QUERIES.tokens}`);
  });

  it("allows any colour when nothing is chosen", () => {
    expect(buildColorQuery([], "not a house", "")).toBe("is:commander");
  });
});

describe("themes", () => {
  it("maps the quick-pick chips and common spellings onto curated themes", () => {
    expect(normalizeThemeKey("+1/+1 Counters")).toBe("counters");
    expect(normalizeThemeKey("Big Mana")).toBe("bigmana");
    expect(normalizeThemeKey("Reanimator")).toBe("graveyard");
  });

  it("turns plural tribes into the singular printed on type lines", () => {
    expect(singularType("Dragons")).toBe("Dragon");
    expect(singularType("Elves")).toBe("Elf");
    expect(singularType("Boss")).toBe("Boss");
  });

  it("uses the curated search for a known theme", () => {
    expect(resolveThemeQuery("Lifegain")).toBe(ARCHETYPE_QUERIES.lifegain);
  });

  it("falls back to a text and type search for anything else", () => {
    expect(resolveThemeQuery("Dragons")).toBe('(o:"Dragons" or t:"Dragons" or t:"Dragon")');
    expect(resolveThemeQuery('mi"ll')).toBe('(o:"mill" or t:"mill")');
    expect(resolveThemeQuery("  ")).toBeNull();
  });
});

describe("categoryQuery", () => {
  const commander = { archetype: "tokens" };

  it("limits cards to the commander's colours and skips lands", () => {
    expect(categoryQuery("ramp", ["G", "W"], commander, "random", null)).toBe("f:commander id<=gw -t:land otag:ramp");
  });

  it("treats a colourless commander as colourless, not any colour", () => {
    expect(categoryQuery("draw", [], commander, "random", null)).toBe("f:commander id<=c -t:land otag:card-advantage");
  });

  it("leans synergy into a typed theme first, then the guessed archetype", () => {
    expect(categoryQuery("synergy", ["B"], commander, "random", "o:mill")).toBe("f:commander id<=b -t:land o:mill");
    expect(categoryQuery("synergy", ["B"], commander, "edhrec", null)).toBe(`f:commander id<=b -t:land ${ARCHETYPE_QUERIES.tokens}`);
    expect(categoryQuery("synergy", ["B"], commander, "random", null)).toBe("f:commander id<=b -t:land");
  });
});

describe("nonbasicTarget", () => {
  const bracket = (id) => ({ id });

  it("runs more nonbasic lands the more colours and the higher the bracket", () => {
    expect(nonbasicTarget(["R"], bracket(1))).toBe(1);
    expect(nonbasicTarget(["R", "G"], bracket(2))).toBe(10);
    expect(nonbasicTarget(["W", "U", "B", "R", "G"], bracket(4))).toBe(23);
    expect(nonbasicTarget([], bracket(3))).toBe(11);
  });
});

describe("fixesFor", () => {
  it("keeps lands that make two of the deck's colours", () => {
    expect(fixesFor({ produced_mana: ["U", "R"] }, ["U", "R"])).toBe(true);
    expect(fixesFor({ produced_mana: ["U", "W"] }, ["U", "R"])).toBe(false);
  });

  it("keeps fetch lands that find two of the deck's basic types, or any basic", () => {
    expect(fixesFor({ oracle_text: "Search your library for a Mountain or Forest card" }, ["R", "G"])).toBe(true);
    expect(fixesFor({ oracle_text: "Search your library for a basic land card" }, ["R", "G"])).toBe(true);
    expect(fixesFor({ oracle_text: "Search your library for a Plains card" }, ["R", "G"])).toBe(false);
  });

  it("leaves out fetch lands that find only one of the deck's types", () => {
    expect(fixesFor({ oracle_text: "Search your library for a Mountain or Forest card" }, ["U", "R"])).toBe(false);
  });
});

describe("fetch lands", () => {
  const strand = { name: "Flooded Strand", oracleText: "{T}, Pay 1 life, Sacrifice Flooded Strand: Search your library for a Plains or Island card, put it onto the battlefield, then shuffle." };
  const vista = { name: "Prismatic Vista", oracleText: "{T}, Pay 1 life, Sacrifice Prismatic Vista: Search your library for a basic land card, put it onto the battlefield, then shuffle." };
  const wilds = { name: "Evolving Wilds", oracle_text: "{T}, Sacrifice Evolving Wilds: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle." };
  const shock = { name: "Hallowed Fountain", oracleText: "({T}: Add {W} or {U}.) As Hallowed Fountain enters, you may pay 2 life." };
  const tower = { name: "Command Tower", oracleText: "{T}: Add one mana of any color in your commander's color identity." };

  it("spots lands that sacrifice themselves to find another", () => {
    expect([strand, vista, wilds].every(isFetchLand)).toBe(true);
    expect([shock, tower].some(isFetchLand)).toBe(false);
  });

  it("keeps only the first two fetches and every other land", () => {
    expect(limitFetchLands([strand, shock, vista, tower, wilds]).map((l) => l.name))
      .toEqual(["Flooded Strand", "Hallowed Fountain", "Prismatic Vista", "Command Tower"]);
  });
});
