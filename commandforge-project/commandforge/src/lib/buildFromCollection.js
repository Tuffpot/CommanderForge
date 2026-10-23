import { BASIC_LAND } from "./colors";
import { categoryQuery, nonbasicTarget, fixesFor, fetchLandLimit, limitFetchLands, monoLandNames, worksInMono } from "./queries";
import { scryfallSearchCards, mapScryfallCard, fetchScryfallData } from "./scryfall";
import { popularityWeightedShuffle } from "./budget";
import { dropIrrelevant } from "./relevance";
import { NONLAND_TARGET, LAND_TARGET, checkCombos, summariseBracket } from "./buildDeck";
import { applyBracketLimits, bracketLimits, fetchGameChangers } from "./bracketRules";
import {
  CATEGORY_TESTS, synergyTest, fullText, isLand, isBasicLand, legalInCommander, fitsIdentity, byPopularity,
} from "./collection";

// The order roles are filled in. The ones a deck can't run without go
// first, so a card that is both removal and a win condition counts as
// removal when the collection is short on removal.
const FILL_ORDER = ["ramp", "removal", "draw", "protection", "wincon", "utility", "synergy"];
// How many cards to suggest buying for each role the collection is short on.
const SUGGESTIONS_PER_ROLE = 5;

/* Builds the 99 from cards the person owns. Same recipe and brackets as
   buildDeck, but the pool is the collection instead of Scryfall's search
   results, and nothing is budgeted: owned cards cost nothing. When the
   collection can't fill a role, the slot goes to the best other owned
   card, and the result lists cards worth buying for that role. Only a
   collection with fewer than 62 playable spells gets cards the person
   doesn't own, each marked `missing`. */
export async function buildDeckFromCollection(commander, style, bracket, ownedCards, opts = {}) {
  const { priceSource = "none", theme = null, themeQuery = null } = opts;
  const identity = commander.identity;
  const recipe = bracket.recipe;
  const commanderKey = commander.name.toLowerCase();
  const usedNames = new Set([commanderKey]);
  const picks = { ramp: [], draw: [], removal: [], protection: [], synergy: [], wincon: [], utility: [] };
  const cardData = {};

  // These only tap for the commander's colours, so they make nothing in a
  // colourless deck.
  const deadInColorless = new Set(["arcane signet", "command tower"]);
  const playable = Object.values(ownedCards).filter((c) =>
    c.name.toLowerCase() !== commanderKey &&
    legalInCommander(c) &&
    fitsIdentity(c, identity) &&
    !isBasicLand(c) &&
    (identity.length > 0 || !deadInColorless.has(c.name.toLowerCase()))
  );
  playable.forEach((c) => { cardData[c.name.toLowerCase()] = mapScryfallCard(c); });

  // "Random" builds keep some variety from deck to deck, still weighted
  // toward the most played cards; "inspired" builds take them in order.
  const order = (list) => {
    const sorted = [...list].sort(byPopularity);
    return style === "edhrec" ? sorted : popularityWeightedShuffle(sorted);
  };
  // The bracket's rules on Game Changers, mass land denial and extra turns,
  // with Scryfall's own flag on each card standing in if the search fails.
  const limits = bracketLimits(bracket.id);
  const gameChangers = limits.gameChangers < Infinity
    ? (await fetchGameChangers(identity).catch(() => null)) ||
      new Set(Object.values(ownedCards).filter((c) => c.game_changer).map((c) => c.name.toLowerCase()))
    : new Set();
  const commanderIsGameChanger = gameChangers.has(commanderKey) || Boolean(commander.gameChanger);
  const [spells, lands] = applyBracketLimits(
    [order(playable.filter((c) => !isLand(c))), playable.filter(isLand).sort(byPopularity)],
    limits,
    gameChangers,
    { gameChangersUsed: commanderIsGameChanger ? 1 : 0 }
  );

  const tests = { ...CATEGORY_TESTS, synergy: synergyTest(commander, style, theme) || (() => true) };
  const take = (cat, card) => {
    usedNames.add(card.name.toLowerCase());
    picks[cat].push({ name: card.name });
  };

  FILL_ORDER.forEach((cat) => {
    for (const card of spells) {
      if (picks[cat].length >= recipe[cat]) break;
      if (usedNames.has(card.name.toLowerCase())) continue;
      if (tests[cat](card, fullText(card))) take(cat, card);
    }
  });

  // Roles the collection couldn't fill, before any spare cards cover them.
  const shortRoles = {};
  Object.keys(recipe).forEach((cat) => {
    if (picks[cat].length < recipe[cat]) shortRoles[cat] = { have: picks[cat].length, want: recipe[cat] };
  });

  // The rest of the spell slots go to the best owned cards left, filed
  // under Utility since they weren't picked for a particular job.
  const nonlandCount = () => Object.values(picks).reduce((s, l) => s + l.length, 0);
  for (const card of spells) {
    if (nonlandCount() >= NONLAND_TARGET) break;
    if (!usedNames.has(card.name.toLowerCase())) take("utility", card);
  }

  // Swap out payoffs the deck can't use, like Mystic Forge in a deck with a
  // handful of artifacts, for another owned spell.
  const relevant = dropIrrelevant(
    picks, commander, cardData,
    () => spells.filter((c) => !usedNames.has(c.name.toLowerCase())).map((c) => ({ name: c.name })),
    () => true,
    [theme, themeQuery, commander.archetype].filter(Boolean).join("\n")
  );
  relevant.swaps.forEach(({ from, to }) => {
    usedNames.delete(from.name.toLowerCase());
    usedNames.add(to.name.toLowerCase());
  });
  Object.assign(picks, relevant.picks);

  // Lands: fixing first in a multicolour deck, then the most played of the
  // rest, leaving room for a couple of basics of each colour.
  const multicolor = identity.length > 1;
  // Only as many fetch lands as real decks at this level run, so dual lands
  // fill the rest.
  const monoOrder = new Map(monoLandNames(identity).map((n, i) => [n.toLowerCase(), i]));
  const monoRank = (l) => monoOrder.get(l.name.toLowerCase()) ?? Infinity;
  const landOrder = limitFetchLands(multicolor
    ? [...lands.filter((l) => fixesFor(l, identity)), ...lands.filter((l) => !fixesFor(l, identity))]
    // Mono-colour: the colour's staple lands first, and none that only help
    // other colours.
    : [...lands.filter((l) => monoOrder.has(l.name.toLowerCase())).sort((a, b) => monoRank(a) - monoRank(b)),
      ...lands.filter((l) => !monoOrder.has(l.name.toLowerCase()) && (identity.length !== 1 || worksInMono(l, identity)))],
  fetchLandLimit(identity, bracket));
  const nonbasicCap = Math.max(0, Math.min(nonbasicTarget(identity, bracket), LAND_TARGET - 2 * identity.length));
  const nonbasics = landOrder.slice(0, nonbasicCap).map((l) => {
    usedNames.add(l.name.toLowerCase());
    return { name: l.name, qty: 1 };
  });

  // Searches for the short roles, used both for suggestions and, if the
  // collection simply hasn't enough spells, to fill the deck.
  const shortCats = Object.keys(shortRoles);
  const searched = {};
  if (shortCats.length) {
    const results = await Promise.all(
      shortCats.map((cat) =>
        scryfallSearchCards(categoryQuery(cat, identity, commander, style, themeQuery), priceSource).catch(() => [])
      )
    );
    // Cards to buy never take a Game Changer or extra-turn slot the
    // collection might already have used.
    const strict = limits.gameChangers < Infinity ? { ...limits, gameChangers: 0, extraTurns: 0 } : limits;
    shortCats.forEach((cat, i) => {
      searched[cat] = applyBracketLimits([results[i].map(mapScryfallCard)], strict, gameChangers)[0]
        .filter((c) => !ownedCards[c.name.toLowerCase()] && c.name.toLowerCase() !== commanderKey);
      searched[cat].forEach((c) => { cardData[c.name.toLowerCase()] = c; });
    });
  }

  // Only when the collection hasn't 62 playable spells: top up the short
  // roles with cards the person would need to get.
  let missingCount = 0;
  shortCats.forEach((cat) => {
    for (const card of searched[cat]) {
      if (nonlandCount() >= NONLAND_TARGET || picks[cat].length >= recipe[cat]) break;
      if (usedNames.has(card.name.toLowerCase())) continue;
      usedNames.add(card.name.toLowerCase());
      picks[cat].push({ name: card.name, missing: true });
      missingCount++;
    }
  });

  const suggestions = {};
  shortCats.forEach((cat) => {
    const list = searched[cat].filter((c) => !usedNames.has(c.name.toLowerCase())).slice(0, SUGGESTIONS_PER_ROLE);
    if (list.length) suggestions[cat] = list.map((c) => c.name);
  });

  // Anything still short becomes basic lands, as in the normal builder.
  const deficit = NONLAND_TARGET - nonlandCount();
  const basicsNeeded = LAND_TARGET + deficit - nonbasics.length;
  const basics = [];
  const basicColors = identity.length ? identity : ["C"];
  basicColors.forEach((c, i) => {
    const share = Math.floor(basicsNeeded / basicColors.length) + (i < basicsNeeded % basicColors.length ? 1 : 0);
    if (share > 0) basics.push({ name: BASIC_LAND[c], qty: share });
  });

  try {
    Object.assign(cardData, await fetchScryfallData([...new Set(basics.map((b) => b.name))]));
  } catch {
    // basics are near-free either way; missing images here are harmless
  }

  // Brackets 1 to 3 allow no two-card combos. A combo card is swapped for
  // the next owned spell that isn't in the deck.
  const comboCheck = await checkCombos(limits, commander, picks, nonbasics, () =>
    spells.filter((c) => !usedNames.has(c.name.toLowerCase())).map((c) => c.name)
  );
  Object.assign(picks, comboCheck.picks);

  return {
    picks,
    nonbasics,
    basics,
    bracketCheck: summariseBracket(limits, commander, picks, nonbasics, cardData, gameChangers, commanderIsGameChanger, comboCheck),
    cardData,
    shortfall: Math.max(0, deficit),
    shortRoles,
    suggestions,
    missingCount,
  };
}
