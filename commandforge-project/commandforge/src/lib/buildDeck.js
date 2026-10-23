import { BASIC_LAND } from "./colors";
import { categoryQuery, nonbasicTarget } from "./queries";
import { scryfallSearchCards, mapScryfallCard, fetchFixingLands, fetchCheapestPrintings, fetchScryfallData } from "./scryfall";
import {
  priceOf, UNKNOWN_PRICE_ESTIMATE, cheapestFirst, spend, orderCandidates,
  pickWithinBudget, AUTO_INCLUDES, pullStaples, upgradeWithinBudget,
} from "./budget";

export const BRACKETS = [
  { id: 1, name: "Exhibition", tag: "Casual / jank", recipe: { ramp: 6, draw: 8, removal: 6, protection: 2, synergy: 15, wincon: 1, utility: 24 } },
  { id: 2, name: "Core", tag: "Precon level", recipe: { ramp: 8, draw: 8, removal: 8, protection: 3, synergy: 15, wincon: 3, utility: 17 } },
  { id: 3, name: "Upgraded", tag: "Tuned", recipe: { ramp: 10, draw: 8, removal: 10, protection: 4, synergy: 15, wincon: 5, utility: 10 } },
  { id: 4, name: "Optimized", tag: "High power", recipe: { ramp: 12, draw: 8, removal: 11, protection: 5, synergy: 13, wincon: 5, utility: 8 } },
  { id: 5, name: "cEDH", tag: "Competitive", recipe: { ramp: 14, draw: 6, removal: 12, protection: 6, synergy: 10, wincon: 5, utility: 9 } },
];
export const NONLAND_TARGET = 62;
const ALTERNATIVES_PER_ROLE = 12;
export const LAND_TARGET = 99 - NONLAND_TARGET;

export async function buildDeck(commander, style, bracket, opts = {}) {
  const { budget = null, priceSource = "none", themeQuery = null } = opts;
  const identity = commander.identity;
  const recipe = bracket.recipe;
  const usedNames = new Set([commander.name.toLowerCase()]);
  const picks = { ramp: [], draw: [], removal: [], protection: [], synergy: [], wincon: [], utility: [] };
  const cardData = {};
  let nonlandTotal = 0;

  const catKeys = Object.keys(recipe);
  const multicolor = identity.length > 1;
  const ownCommanderPrice = priceSource === "eur" ? commander.priceEur : commander.priceUsd;
  const [categoryResults, nonbasicRaw, fixingLands, commanderPrinting] = await Promise.all([
    Promise.all(catKeys.map((cat) => scryfallSearchCards(categoryQuery(cat, identity, commander, style, themeQuery), priceSource).catch(() => []))),
    scryfallSearchCards(`f:commander id<=${identity.join("").toLowerCase() || "c"} t:land -t:basic`, priceSource).catch(() => []),
    multicolor ? fetchFixingLands(identity, priceSource) : Promise.resolve([]),
    // The printing the commander search returned may have no price, so look
    // up its cheapest priced one before budgeting.
    priceSource !== "none" && ownCommanderPrice == null
      ? fetchCheapestPrintings([commander.name], priceSource).catch(() => ({}))
      : Promise.resolve({}),
  ]);
  Object.assign(cardData, commanderPrinting);

  // If every single fetch came back empty, this is almost certainly a
  // network failure rather than a genuinely cardless color combo — surface
  // that clearly instead of silently handing back a near-empty deck.
  const totalFetched = categoryResults.reduce((a, r) => a + r.length, 0) + nonbasicRaw.length;
  if (totalFetched === 0) throw new Error("Scryfall returned no data — likely a network issue");

  const categoryCards = {};
  // These only tap for the commander's colours, so they make nothing in a
  // colourless deck.
  const deadInColorless = new Set(["arcane signet", "command tower"]);
  catKeys.forEach((cat, i) => {
    categoryCards[cat] = categoryResults[i].map(mapScryfallCard)
      .filter((c) => identity.length > 0 || !deadInColorless.has(c.name.toLowerCase()));
    categoryCards[cat].forEach((c) => { cardData[c.name.toLowerCase()] = c; });
  });
  // Multicolour pools put the tiered fixing lands first, then whatever other
  // popular lands are left (utility lands like Reliquary Tower).
  const fixingNames = new Set(fixingLands.map((c) => c.name.toLowerCase()));
  const nonbasicPool = [
    ...fixingLands,
    ...nonbasicRaw.map(mapScryfallCard).filter((c) => !fixingNames.has(c.name.toLowerCase())),
  ];
  nonbasicPool.forEach((c) => { cardData[c.name.toLowerCase()] = c; });

  const budgetActive = budget != null && budget > 0 && priceSource !== "none";
  // The commander is part of the deck's cost, so its price comes off the
  // budget before any of the 99 are picked. A commander that costs more than
  // the whole budget leaves nothing, and the 99 are built as cheaply as possible.
  const commanderPrice = ownCommanderPrice != null
    ? parseFloat(ownCommanderPrice)
    : priceOf(commander.name, cardData, priceSource) ?? 0;
  const deckBudget = budgetActive ? Math.max(0, budget - commanderPrice) : Infinity;
  // Basics are effectively free, so the budget really has to cover the
  // nonland cards plus the handful of nonbasic lands — that's the slot
  // count the per-card ceiling is averaged over.
  const pricedSlots = NONLAND_TARGET + nonbasicTarget(identity, bracket);
  const nonbasicTargetCount = Math.min(nonbasicPool.length, nonbasicTarget(identity, bracket));

  /* What the cheapest legal version of this deck would cost: the mandatory
     staples plus the cheapest available card for every remaining slot. The
     budget has to cover this no matter what, so only the money ABOVE it is
     genuinely available to spend on upgrades. Working from that figure is
     what lets a tight budget land as close to the target as the card pool
     allows, instead of overspending early and being forced past it at the
     end. */
  const priceFor = (c) => priceOf(c.name, cardData, priceSource) ?? UNKNOWN_PRICE_ESTIMATE;
  const sumOf = (arr) => arr.reduce((s, c) => s + priceFor(c), 0);
  let baselineCost = 0;
  catKeys.forEach((cat) => {
    const { staples, rest } = pullStaples(categoryCards[cat], AUTO_INCLUDES[cat] || []);
    const need = Math.max(0, recipe[cat] - staples.length);
    baselineCost += sumOf(staples) + sumOf(cheapestFirst(rest, cardData, priceSource).slice(0, need));
  });
  baselineCost += sumOf(cheapestFirst(nonbasicPool, cardData, priceSource).slice(0, nonbasicTargetCount));

  const budgetState = {
    active: budgetActive,
    total: deckBudget,
    remaining: deckBudget,
    slotsRemaining: pricedSlots,
    // Money available above the cheapest legal build. Zero means the budget
    // barely covers (or can't cover) a legal 99 — build the cheapest version.
    discretionary: budgetActive ? Math.max(0, deckBudget - baselineCost) : Infinity,
  };
  const preferExpensive = !budgetActive;

  // Lands are picked before the nonland categories so the mana base gets
  // first call on the upgrade budget. Picked last, the fetches and shocks
  // only ever saw whatever money the spells had left, which was usually
  // none, so multicolour decks fell straight through to guildgates.
  const nonbasicRawFiltered = nonbasicPool.filter((l) => !usedNames.has(l.name.toLowerCase()));
  const { staples: landStaples, rest: nonbasicRest } =
    identity.length > 1 ? pullStaples(nonbasicRawFiltered, ["Command Tower"]) : { staples: [], rest: nonbasicRawFiltered };

  // Fixing lands keep their tier order (best cycles first) so the budget
  // check walks down from shocks and fetches to gain lands and guildgates.
  const nonbasicCandidates = multicolor ? nonbasicRest : orderCandidates(nonbasicRest, cardData, priceSource, preferExpensive);
  const cheapNonbasics = cheapestFirst(nonbasicRest, cardData, priceSource);
  // Leave room for a couple of basics of each colour so fetch lands have
  // targets. Any nonland shortfall later only adds more basics.
  const nonbasicCap = Math.max(0, LAND_TARGET - 2 * identity.length);
  const nonbasicRestTarget = Math.max(0, Math.min(nonbasicCandidates.length, nonbasicTarget(identity, bracket), nonbasicCap) - landStaples.length);
  const nonbasicsFilled = pickWithinBudget(nonbasicCandidates, nonbasicRestTarget, cardData, priceSource, budgetState, cheapNonbasics);

  if (budgetState.active) {
    landStaples.forEach((c) => {
      spend(budgetState, priceOf(c.name, cardData, priceSource) ?? UNKNOWN_PRICE_ESTIMATE);
    });
  }

  const nonbasicsChosen = [...landStaples, ...nonbasicsFilled];
  nonbasicsChosen.forEach((c) => usedNames.add(c.name.toLowerCase()));

  catKeys.forEach((cat) => {
    const rawCandidates = categoryCards[cat].filter((c) => !usedNames.has(c.name.toLowerCase()));
    const { staples, rest } = pullStaples(rawCandidates, AUTO_INCLUDES[cat] || []);

    const orderedRest = orderCandidates(rest, cardData, priceSource, preferExpensive);
    const cheapRest = cheapestFirst(rest, cardData, priceSource);
    const remainingTarget = Math.max(0, recipe[cat] - staples.length);
    const filled = pickWithinBudget(orderedRest, remainingTarget, cardData, priceSource, budgetState, cheapRest);

    if (budgetState.active) {
      staples.forEach((c) => {
        spend(budgetState, priceOf(c.name, cardData, priceSource) ?? UNKNOWN_PRICE_ESTIMATE);
      });
    }

    const take = [...staples, ...filled];
    take.forEach((c) => usedNames.add(c.name.toLowerCase()));
    picks[cat] = take;
    nonlandTotal += take.length;
  });

  const deficit = NONLAND_TARGET - nonlandTotal;
  const landTarget = LAND_TARGET + deficit;

  // Everything is picked and capped — now put any leftover budget to work
  // on better cards instead of leaving it unspent.
  upgradeWithinBudget(picks, categoryCards, usedNames, cardData, priceSource, budgetState);

  const nonbasics = nonbasicsChosen.map((l) => ({ name: l.name, qty: 1 }));

  const basicsNeeded = landTarget - nonbasics.length;
  const basics = [];
  // A colourless commander can't run coloured basics, so the rest is Wastes.
  const basicColors = identity.length ? identity : ["C"];
  basicColors.forEach((c, i) => {
    const share = Math.floor(basicsNeeded / basicColors.length) + (i < basicsNeeded % basicColors.length ? 1 : 0);
    if (share > 0) basics.push({ name: BASIC_LAND[c], qty: share });
  });

  try {
    const basicData = await fetchScryfallData([...new Set(basics.map((b) => b.name))]);
    Object.assign(cardData, basicData);
  } catch {
    // basics are near-free either way; missing price data here is harmless
  }

  // Safety net for anything still unpriced (including the commander, whose
  // printing came from the commander search): look up its cheapest priced
  // printing so the card list and deck total don't silently skip it.
  if (priceSource !== "none") {
    const unpriced = [
      commander.name,
      ...Object.values(picks).flat().map((c) => c.name),
      ...nonbasics.map((l) => l.name),
    ].filter((name) => priceOf(name, cardData, priceSource) == null);
    try {
      Object.assign(cardData, await fetchCheapestPrintings(unpriced, priceSource));
    } catch {
      // leave them unpriced; the list shows "—" for those
    }
  }

  // The next-best cards for each role that didn't make the deck, so the
  // result screen can offer a swap.
  const inDeck = new Set([commander.name, ...Object.values(picks).flat().map((c) => c.name), ...nonbasics.map((l) => l.name)].map((n) => n.toLowerCase()));
  const alternatives = {};
  catKeys.forEach((cat) => {
    alternatives[cat] = categoryCards[cat].filter((c) => !inDeck.has(c.name.toLowerCase())).slice(0, ALTERNATIVES_PER_ROLE).map((c) => c.name);
  });

  return { picks, nonbasics, basics, alternatives, budgetActive, budgetRemaining: budgetState.remaining, cardData, shortfall: Math.max(0, deficit) };
}

export const CAT_LABELS = {
  ramp: "Ramp",
  draw: "Card Draw",
  removal: "Removal & Interaction",
  protection: "Protection",
  synergy: "Synergy & Payoffs",
  wincon: "Win Conditions",
  utility: "Utility",
};
