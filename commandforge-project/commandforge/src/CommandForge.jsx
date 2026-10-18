import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Search, Sparkles, Swords, Save, ChevronLeft, Shuffle, Lightbulb, Check, ExternalLink, ImageOff, Loader2, X, ClipboardCopy, User, LogOut } from "lucide-react";
import { supabase } from "./supabaseClient";

/* ---------------------------------------------------------
   COMMANDERS — sourced live from Scryfall, not a fixed list
--------------------------------------------------------- */
// Rough keyword-based archetype guess so EDHREC-inspired mode can still lean
// into a commander's theme even when it isn't one we've hand-curated.
const ARCHETYPE_KEYWORDS = [
  ["aristocrats", ["sacrifice another creature", "whenever a creature you control dies", "sacrifice a creature"]],
  ["tokens", ["create a", "create two", "create x", "populate", "token"]],
  ["spellslinger", ["instant or sorcery spell", "whenever you cast an instant", "magecraft", "noncreature spell"]],
  ["graveyard", ["from your graveyard", "return target creature card from your graveyard", "mill"]],
  ["counters", ["+1/+1 counter"]],
  ["wheels", ["draw a card for each", "each player draws", "discard your hand"]],
  ["ninjas", ["ninjutsu"]],
  ["enchantments", ["enchantment you control", "constellation"]],
  ["bigmana", ["additional land", "search your library for a basic land", "extra land"]],
  ["lifegain", ["gain life", "whenever you gain life", "lifelink"]],
];

function guessArchetype(oracleText) {
  const text = (oracleText || "").toLowerCase();
  const hit = ARCHETYPE_KEYWORDS.find(([, keywords]) => keywords.some((k) => text.includes(k)));
  return hit ? hit[0] : null;
}

function mapScryfallCardToCommander(card) {
  const faceImages = card.image_uris || card.card_faces?.[0]?.image_uris || null;
  const oracleText = card.oracle_text || card.card_faces?.map((f) => f.oracle_text).filter(Boolean).join("\n\n") || null;
  const typeLine = card.card_faces?.[0]?.type_line || card.type_line || "";
  return {
    name: card.name,
    identity: card.color_identity || [],
    archetype: guessArchetype(oracleText),
    blurb: typeLine || "Legendary creature",
    imageSmall: faceImages?.small || null,
    imageLarge: faceImages?.large || faceImages?.png || null,
    priceUsd: card.prices?.usd || card.prices?.usd_foil || null,
    priceEur: card.prices?.eur || card.prices?.eur_foil || null,
    scryfallUri: card.scryfall_uri || null,
    oracleText,
  };
}

async function scryfallSearchCommanders(query) {
  const res = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&order=edhrec&unique=cards`);
  if (res.status === 404) return { cards: [], total: 0 };
  if (!res.ok) throw new Error(`Scryfall responded ${res.status}`);
  const json = await res.json();
  return { cards: (json.data || []).slice(0, 20).map(mapScryfallCardToCommander), total: json.total_cards || 0 };
}

async function scryfallRandomCommander(query) {
  const res = await fetch(`https://api.scryfall.com/cards/random?q=${encodeURIComponent(query)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Scryfall responded ${res.status}`);
  const card = await res.json();
  return mapScryfallCardToCommander(card);
}

function buildNameQuery(name) {
  const trimmed = name.trim();
  // Restricted to the name field specifically — Scryfall's default bare-word
  // search also matches type lines and oracle text, which was letting
  // unrelated commanders (e.g. Atraxa) show up for an unrelated name search.
  return trimmed ? `is:commander name:"${trimmed.replace(/"/g, "")}"` : "is:commander";
}

// Client-side safety net on top of buildNameQuery: only keep results whose
// name actually contains what was typed, with names that start with it
// ranked first — the "autocomplete" feel the name search should have.
function filterAndSortByName(cards, query) {
  const q = query.trim().toLowerCase();
  if (!q) return cards;
  return cards
    .filter((c) => c.name.toLowerCase().includes(q))
    .sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return a.name.localeCompare(b.name);
    });
}

function buildColorQuery(colorFilter, houseName, theme) {
  let colors = colorFilter;
  const houseMatch = HOUSE_NAMES[houseName.trim().toLowerCase()];
  if (houseMatch) colors = houseMatch;
  let q = colors.length ? `is:commander id=${colors.join("").toLowerCase()}` : "is:commander";
  const themeQuery = resolveThemeQuery(theme);
  if (themeQuery) q += ` ${themeQuery}`;
  return q;
}

/* ---------------------------------------------------------
   BUILD CONSTANTS — bracket recipes, basic land names
--------------------------------------------------------- */
/* ---------------------------------------------------------
   CARD SOURCING — every supporting card, land, and price now
   comes live from Scryfall, not a hand-picked static list.

   Scryfall's search supports "Oracle tags" (otag:) — a
   community-maintained system that labels cards by function
   (ramp, removal, card-advantage, protection, etc). These four
   are well-documented and commonly recommended by EDHREC's own
   Scryfall guide. Win conditions and utility answers don't have
   an equally standard tag, so those two categories use oracle
   text / type-line heuristics instead — still real Scryfall
   syntax, just a closer approximation rather than a curated tag.
--------------------------------------------------------- */
const CATEGORY_TAGS = {
  ramp: "otag:ramp",
  draw: "otag:card-advantage",
  removal: "otag:removal",
  protection: "otag:protection",
};

// Best-effort text queries for categories without a single reliable tag.
// Win conditions are cards that actually end games: outright wins, drains
// that hit every opponent, extra combats, team-wide pump finishers, and big
// creatures that can connect. Board wipes used to live here, but they stop
// the table winning rather than winning for you (removal already covers them).
const WINCON_QUERY =
  '(o:"you win the game" or o:"each opponent loses" or o:"additional combat phase" ' +
  'or (o:"creatures you control get +" o:"until end of turn") ' +
  'or (t:creature pow>=6 (kw:trample or kw:flying or kw:"double strike" or kw:annihilator or o:"can\'t be blocked")) ' +
  "or (t:creature pow>=8))";
// Utility is the toolbox: tutors, counterspells, artifact/enchantment
// answers, graveyard hate and card recursion, rather than only the first.
const UTILITY_QUERY =
  '(otag:tutor or o:"counter target spell" ' +
  'or o:"destroy target artifact" or o:"destroy target enchantment" ' +
  'or o:"exile target artifact" or o:"exile target enchantment" ' +
  "or o:\"exile target player's graveyard\" or o:\"exile all graveyards\" or o:\"exile target card from a graveyard\" " +
  'or (o:"return target" o:"from your graveyard to your hand"))';

// Reused from the archetype guesser — same keywords, phrased as search terms
// so "EDHREC-inspired" mode can pull cards matching a commander's theme.
const ARCHETYPE_QUERIES = {
  aristocrats: '(o:"sacrifice another creature" or o:"whenever a creature you control dies" or o:"sacrifice a creature")',
  tokens: '(o:"create a" or o:"create two" or o:populate)',
  spellslinger: '(o:"instant or sorcery spell" or o:"whenever you cast an instant")',
  graveyard: '(o:"from your graveyard" or o:"return target creature card from your graveyard")',
  counters: 'o:"+1/+1 counter"',
  wheels: '(o:"each player draws" or o:"draw a card for each")',
  ninjas: "o:ninjutsu",
  enchantments: 'o:"enchantment you control"',
  bigmana: '(o:"additional land" or o:"search your library for a basic land")',
  lifegain: '(o:"gain life" or o:"whenever you gain life" or o:lifelink)',
  voltron: '(t:equipment or t:aura or o:"equipped creature" or o:"enchanted creature" or o:"for each aura" or o:"for each equipment")',
};

// Other spellings people type (or that the quick-pick chips produce) for the
// curated archetypes above. Without these, "+1/+1 Counters" normalises to
// "11counters" and silently drops to the much looser free-text search.
const THEME_ALIASES = {
  "11counters": "counters",
  "11counter": "counters",
  plusonecounters: "counters",
  token: "tokens",
  gowide: "tokens",
  sacrifice: "aristocrats",
  spells: "spellslinger",
  reanimator: "graveyard",
  reanimation: "graveyard",
  enchantress: "enchantments",
  ramp: "bigmana",
  equipment: "voltron",
  auras: "voltron",
};

function normalizeThemeKey(text) {
  const key = (text || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return THEME_ALIASES[key] || key;
}

// "Dragons" -> "Dragon", "Elves" -> "Elf", so a typed tribe matches the
// singular creature type printed on the type line.
function singularType(word) {
  const w = word.trim();
  if (/ves$/i.test(w)) return w.slice(0, -3) + "f";
  if (/[^s]s$/i.test(w)) return w.slice(0, -1);
  return w;
}

// Free-text theme search for the color-randomizer path. If what was typed
// matches one of our curated archetypes (lifegain, tokens, aristocrats…) it
// uses that more accurate query; otherwise it falls back to a plain Scryfall
// text search so the person isn't limited to a fixed list of themes at all.
function resolveThemeQuery(themeText) {
  const trimmed = (themeText || "").trim();
  if (!trimmed) return null;
  const curated = ARCHETYPE_QUERIES[normalizeThemeKey(trimmed)];
  if (curated) return curated;
  // No curated match — fall back to a plain search for the typed phrase in
  // either the card's rules text or its type line (catches tribal themes
  // like "dragons" or "elves" as well as mechanical ones).
  // Type lines print the singular ("Creature — Dragon"), so a plural tribe
  // like "dragons" also searches the singular type. The singular isn't used
  // for rules text: o:"elf" would match "itself" on unrelated cards.
  const escaped = trimmed.replace(/"/g, "");
  const singular = singularType(escaped);
  const typePart = singular.toLowerCase() !== escaped.toLowerCase()
    ? `t:"${escaped}" or t:"${singular}"`
    : `t:"${escaped}"`;
  return `(o:"${escaped}" or ${typePart})`;
}

// A handful of starting points shown as quick-pick chips under the free-text
// theme field — clicking one just fills the box, it doesn't limit what can
// be typed there.
const THEME_SUGGESTIONS = [
  "Lifegain", "Aristocrats", "Tokens", "Spellslinger", "Graveyard",
  "+1/+1 Counters", "Wheels", "Ninjas", "Enchantments", "Big Mana", "Dragons", "Voltron",
];

// One-sentence gameplan for each curated archetype, used as the second
// sentence of the deck description. Free-typed themes that don't match one
// of these fall back to a generic line that still names the theme.
const ARCHETYPE_BLURBS = {
  aristocrats: "It sacrifices its own creatures for value, grinding out advantage every time something dies.",
  tokens: "It floods the board with token creatures and looks to go wide for a big combined attack.",
  spellslinger: "It chains together cheap instants and sorceries to trigger payoffs and burn through the deck.",
  graveyard: "It fills its graveyard and recurs threats from it, turning removal spells into a resource rather than a setback.",
  counters: "It piles +1/+1 counters onto its creatures, scaling into a dominant late-game board.",
  wheels: "It forces everyone to draw and discard, refilling its own hand while disrupting the rest of the table.",
  ninjas: "It slips unblocked attackers in and out of combat to chain Ninjutsu triggers and card advantage.",
  enchantments: "It stacks up enchantments for incremental value and powerful constellation-style triggers.",
  bigmana: "It ramps hard into a handful of huge threats, aiming to simply outsize the table.",
  lifegain: "It gains large amounts of life and turns that life total into a real engine for winning the game.",
  voltron: "It suits up one creature with equipment and auras, then swings for lethal commander damage.",
};

function strategyBlurb(deck) {
  const key = deck.theme ? normalizeThemeKey(deck.theme) : deck.commander.archetype;
  if (key && ARCHETYPE_BLURBS[key]) return ARCHETYPE_BLURBS[key];
  if (deck.theme) return `It leans into a ${deck.theme.toLowerCase()} gameplan, built around cards that reinforce that theme.`;
  return "It plays a flexible, value-driven game — developing its board, answering threats, and grinding out card advantage along the way.";
}

// A short, two-sentence summary of what kind of deck just got built and
// roughly how it plays, shown at the top of the result screen.
function describeDeck(deck) {
  if (!deck) return "";
  const styleText = deck.style === "edhrec" ? "An EDHREC-inspired build" : "A randomly assembled build";
  const themeText = deck.theme ? ` leaning into a ${deck.theme} theme` : "";
  const colorsText = deck.commander.identity.length
    ? ` in ${houseNameForColors(deck.commander.identity)} colors`
    : " with no color identity";
  const overview = `${styleText} around ${deck.commander.name}${themeText}, aimed at Bracket ${deck.bracket.id} (${deck.bracket.name}) power level${colorsText}.`;
  return `${overview} ${strategyBlurb(deck)}`;
}

function categoryQuery(cat, identity, commander, style, themeQuery) {
  const idPart = `id<=${identity.join("").toLowerCase() || "c"}`;
  const base = `f:commander ${idPart} -t:land`;
  if (cat === "wincon") return `${base} ${WINCON_QUERY}`;
  if (cat === "utility") return `${base} ${UTILITY_QUERY}`;
  if (cat === "synergy") {
    // An explicit typed-in theme takes priority over the keyword-guessed
    // archetype — it's a deliberate choice, not a best-effort guess.
    const archQuery = themeQuery || (style === "edhrec" && commander.archetype && ARCHETYPE_QUERIES[commander.archetype]);
    return archQuery ? `${base} ${archQuery}` : base;
  }
  return `${base} ${CATEGORY_TAGS[cat]}`;
}

// With unique=cards Scryfall returns one printing per card, and by default
// that can be a promo, Secret Lair or digital-only printing with no price at
// all. Those cards then showed "—" and were budgeted at a flat guess. Asking
// for the cheapest printing that has a price in the chosen currency fixes
// both the displayed price and the budget maths.
function preferPricedPrinting(priceSource) {
  if (priceSource === "usd") return " prefer:usd-low";
  if (priceSource === "eur") return " prefer:eur-low";
  return "";
}

async function scryfallSearchCards(query, priceSource = "none") {
  const q = query + preferPricedPrinting(priceSource);
  const res = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&order=edhrec&unique=cards`);
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Scryfall responded ${res.status}`);
  const json = await res.json();
  return json.data || [];
}

function mapScryfallCard(card) {
  const faceImages = card.image_uris || card.card_faces?.[0]?.image_uris || null;
  const oracleText = card.oracle_text || card.card_faces?.map((f) => f.oracle_text).filter(Boolean).join("\n\n") || null;
  return {
    name: card.name,
    imageSmall: faceImages?.small || null,
    imageLarge: faceImages?.large || faceImages?.png || null,
    priceUsd: card.prices?.usd || card.prices?.usd_foil || null,
    priceEur: card.prices?.eur || card.prices?.eur_foil || null,
    scryfallUri: card.scryfall_uri || null,
    oracleText,
  };
}

const BASIC_LAND = { W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest", C: "Wastes" };

const BRACKETS = [
  { id: 1, name: "Exhibition", tag: "Casual / jank", recipe: { ramp: 6, draw: 8, removal: 6, protection: 2, synergy: 15, wincon: 1, utility: 24 } },
  { id: 2, name: "Core", tag: "Precon level", recipe: { ramp: 8, draw: 8, removal: 8, protection: 3, synergy: 15, wincon: 3, utility: 17 } },
  { id: 3, name: "Upgraded", tag: "Tuned", recipe: { ramp: 10, draw: 8, removal: 10, protection: 4, synergy: 15, wincon: 5, utility: 10 } },
  { id: 4, name: "Optimized", tag: "High power", recipe: { ramp: 12, draw: 8, removal: 11, protection: 5, synergy: 13, wincon: 5, utility: 8 } },
  { id: 5, name: "cEDH", tag: "Competitive", recipe: { ramp: 14, draw: 6, removal: 12, protection: 6, synergy: 10, wincon: 5, utility: 9 } },
];
const NONLAND_TARGET = 62;
const LAND_TARGET = 99 - NONLAND_TARGET;

const HOUSE_NAMES = {
  azorius: ["W", "U"], dimir: ["U", "B"], rakdos: ["B", "R"], gruul: ["R", "G"], selesnya: ["G", "W"],
  orzhov: ["W", "B"], izzet: ["U", "R"], golgari: ["B", "G"], boros: ["R", "W"], simic: ["G", "U"],
  jeskai: ["W", "U", "R"], sultai: ["U", "B", "G"], mardu: ["B", "R", "W"], temur: ["R", "G", "U"], abzan: ["G", "W", "B"],
  bant: ["G", "W", "U"], esper: ["W", "U", "B"], grixis: ["U", "B", "R"], jund: ["B", "R", "G"], naya: ["R", "G", "W"],
  colorless: ["C"], colourless: ["C"],
};

const SINGLE_COLOR_NAMES = { W: "Mono-White", U: "Mono-Blue", B: "Mono-Black", R: "Mono-Red", G: "Mono-Green", C: "Colorless" };

// Four-color (missing one color) nicknames, from the Ravnica Nephilim cycle
const FOUR_COLOR_NAMES = {
  W: "Glint (non-White)",
  U: "Dune (non-Blue)",
  B: "Ink (non-Black)",
  R: "Witch (non-Red)",
  G: "Yore (non-Green)",
};

function houseNameForColors(colors) {
  if (colors.length === 0) return null;
  if (colors.length === 1) return SINGLE_COLOR_NAMES[colors[0]];
  if (colors.length === 4) {
    const missing = ["W", "U", "B", "R", "G"].find((c) => !colors.includes(c));
    return FOUR_COLOR_NAMES[missing];
  }
  if (colors.length >= 5) return "5-Color / Big Mana";
  const sorted = [...colors].sort().join("");
  const match = Object.entries(HOUSE_NAMES).find(([, cols]) => [...cols].sort().join("") === sorted);
  if (match) return match[0][0].toUpperCase() + match[0].slice(1);
  return colors.join("");
}

const COLOR_META = {
  W: { label: "White", swatch: "#F3E7C9" },
  U: { label: "Blue", swatch: "#8ECBEF" },
  B: { label: "Black", swatch: "#9C8FB5" },
  R: { label: "Red", swatch: "#E38B6B" },
  G: { label: "Green", swatch: "#8FBE8A" },
  C: { label: "Colorless", swatch: "#C9C4CE" },
};

// `list` arrives already ordered by Scryfall's EDHREC popularity rank (most
// commonly-played first). A plain uniform shuffle throws that signal away
// completely, which is why well-known staples were showing up on pure luck
// rather than reliably. This keeps some deck-to-deck variety but weights it
// so cards near the top of the popularity order are far more likely to end
// up near the top of the shuffled result too.
function popularityWeightedShuffle(list) {
  return list
    .map((card, i) => ({ card, score: Math.random() * (i + 1) }))
    .sort((a, b) => a.score - b.score)
    .map((x) => x.card);
}

function priceOf(name, cardData, priceSource) {
  const d = cardData[name.toLowerCase()];
  if (!d) return null;
  const p = priceSource === "eur" ? d.priceEur : d.priceUsd;
  return p == null ? null : parseFloat(p);
}

const UNKNOWN_PRICE_ESTIMATE = 2; // used only when a card with no price data must be added under a budget

/* --- Budget shaping ---------------------------------------------------
   No single card may eat an outsized share of the budget. Letting one
   £300 land "fit" inside a £400 budget is technically affordable, but it
   starves the other ~90 slots and forces them all to be bargain-bin
   filler. Two ceilings apply to every pick:

     1. A hard ceiling of MAX_BUDGET_SHARE of the whole budget, so there
        is never a single whale card dominating the deck.
     2. A dynamic ceiling of SPLURGE_FACTOR x the average spend still
        available per unfilled slot. This rises as cheap picks bank
        savings, so the deck can still afford a few genuine chase cards
        later on — just never one that swallows the whole budget.

   Together these produce the spread of expensive / mid / cheap cards a
   real decklist has, instead of one whale plus 90 commons.
---------------------------------------------------------------------- */
const MAX_BUDGET_SHARE = 0.22;
const SPLURGE_FACTOR = 9;
// Stop the upgrade pass once we're this close to the budget, so the last
// slice of budget stays unspent and decks keep some deck-to-deck variety
// rather than every build converging on the same "most popular" list.
const BUDGET_SLACK_TARGET = 0.05;

function cheapestFirst(list, cardData, priceSource) {
  return [...list].sort(
    (a, b) =>
      (priceOf(a.name, cardData, priceSource) ?? UNKNOWN_PRICE_ESTIMATE) -
      (priceOf(b.name, cardData, priceSource) ?? UNKNOWN_PRICE_ESTIMATE)
  );
}

function perCardCap(budgetState) {
  if (!budgetState.active) return Infinity;
  const slots = Math.max(1, budgetState.slotsRemaining);
  const dynamic = (budgetState.remaining / slots) * SPLURGE_FACTOR;
  const hard = budgetState.total * MAX_BUDGET_SHARE;
  return Math.min(Math.max(dynamic, 0), hard);
}

function spend(budgetState, price) {
  budgetState.remaining -= price;
  budgetState.slotsRemaining = Math.max(0, budgetState.slotsRemaining - 1);
}

// Orders candidates priciest-first (no budget, favoring strong staples) or,
// under an active budget, purely by popularity — letting pickWithinBudget
// spend up toward the budget on the best/most popular affordable cards,
// rather than always grabbing the cheapest option in the pool.
function orderCandidates(list, cardData, priceSource, preferExpensive) {
  const shuffled = popularityWeightedShuffle(list);
  if (priceSource === "none" || !preferExpensive) return shuffled;
  return shuffled.sort((a, b) => {
    const pa = priceOf(a.name, cardData, priceSource);
    const pb = priceOf(b.name, cardData, priceSource);
    const va = pa == null ? -1 : pa;
    const vb = pb == null ? -1 : pb;
    return vb - va;
  });
}

/* Picks `target` cards from an already-ordered list.

   Under a budget, every slot is charged only the DIFFERENCE between the
   card taken and the cheapest card that could have filled that slot. The
   cheapest legal fill is paid for up front (see baselineCost in buildDeck),
   so what's tracked here is purely the upgrade money. That's what keeps a
   tight budget honest: the builder can never spend money it will need for
   the slots it hasn't filled yet, which is what used to force the last few
   picks to overshoot. */
function pickWithinBudget(ordered, target, cardData, priceSource, budgetState, cheapSorted) {
  if (!budgetState.active) return ordered.slice(0, target);

  const priceFor = (c) => priceOf(c.name, cardData, priceSource) ?? UNKNOWN_PRICE_ESTIMATE;
  const baselineAt = (i) => (cheapSorted && cheapSorted[i] ? priceFor(cheapSorted[i]) : 0);

  const chosen = [];
  const taken = new Set();

  for (const card of ordered) {
    if (chosen.length >= target) break;
    const price = priceFor(card);
    // Skip anything over the per-card ceiling even when it's affordable —
    // there's nearly always a cheaper card doing a similar job, and taking
    // the whale here is exactly what starved every later slot.
    if (price > perCardCap(budgetState)) continue;
    const delta = price - baselineAt(chosen.length);
    if (delta > budgetState.discretionary) continue;
    chosen.push(card);
    taken.add(card);
    budgetState.discretionary -= delta;
    spend(budgetState, price);
  }

  // Any slots still open get the cheapest cards left, which by definition
  // costs no more than the baseline already set aside for them.
  if (chosen.length < target && cheapSorted) {
    for (const card of cheapSorted) {
      if (chosen.length >= target) break;
      if (taken.has(card)) continue;
      const price = priceFor(card);
      budgetState.discretionary -= price - baselineAt(chosen.length);
      chosen.push(card);
      taken.add(card);
      spend(budgetState, price);
    }
  }
  return chosen;
}

// Cards that show up in the vast majority of real Commander decks on EDHREC
// regardless of color identity or archetype — guaranteed a slot (when the
// category has room and they're actually eligible) rather than left to
// compete on equal footing with everything else in the category.
const AUTO_INCLUDES = {
  ramp: ["Sol Ring", "Arcane Signet"],
  protection: ["Swiftfoot Boots", "Lightning Greaves"],
};

function pullStaples(candidates, names) {
  const staples = names
    .map((n) => candidates.find((c) => c.name.toLowerCase() === n.toLowerCase()))
    .filter(Boolean);
  const rest = candidates.filter((c) => !staples.includes(c));
  return { staples, rest };
}

/* Capping each card keeps any one of them from swallowing the budget, but
   on its own it tends to leave money unspent. This pass puts that leftover
   to work: it repeatedly finds the least-played card currently in the deck
   and trades it for the most expensive unused card that is BOTH better
   played and still under the per-card ceiling. The result spends up toward
   the budget on genuinely stronger cards, rather than panic-filling with
   whatever was cheapest. It deliberately stops a little short of the full
   budget so decks don't all converge on an identical "top cards" list. */
function upgradeWithinBudget(picks, categoryCards, usedNames, cardData, priceSource, budgetState) {
  if (!budgetState.active) return;

  const ranks = {};
  Object.entries(categoryCards).forEach(([cat, list]) => {
    ranks[cat] = new Map(list.map((c, i) => [c.name.toLowerCase(), i]));
  });

  const floor = budgetState.total * BUDGET_SLACK_TARGET;
  let guard = 0;
  let improved = true;

  while (improved && guard++ < 400 && budgetState.discretionary > floor) {
    improved = false;

    for (const cat of Object.keys(picks)) {
      if (budgetState.discretionary <= floor) break;
      const list = categoryCards[cat] || [];
      const rank = ranks[cat];
      const chosen = picks[cat];
      if (!list.length || !chosen || !chosen.length) continue;

      // The weakest card we currently hold in this category.
      let worstIdx = -1;
      let worstRank = -1;
      chosen.forEach((c, i) => {
        const r = rank.get(c.name.toLowerCase()) ?? Infinity;
        if (r > worstRank) {
          worstRank = r;
          worstIdx = i;
        }
      });
      if (worstIdx < 0) continue;

      const worst = chosen[worstIdx];
      // Never trade away a guaranteed staple like Sol Ring.
      if ((AUTO_INCLUDES[cat] || []).some((n) => n.toLowerCase() === worst.name.toLowerCase())) continue;
      const worstPrice = priceOf(worst.name, cardData, priceSource) ?? UNKNOWN_PRICE_ESTIMATE;

      // Best swap = most expensive unused card that is still more played
      // than what we'd drop, affordable, and under the per-card ceiling.
      const cap = perCardCap(budgetState);
      let best = null;
      let bestPrice = worstPrice;
      for (const cand of list) {
        const key = cand.name.toLowerCase();
        if (usedNames.has(key)) continue;
        if ((rank.get(key) ?? Infinity) >= worstRank) continue;
        const p = priceOf(cand.name, cardData, priceSource) ?? UNKNOWN_PRICE_ESTIMATE;
        if (p > cap) continue;
        if (p <= bestPrice) continue;
        if (p - worstPrice > budgetState.discretionary) continue;
        best = cand;
        bestPrice = p;
      }
      if (!best) continue;

      chosen[worstIdx] = best;
      usedNames.delete(worst.name.toLowerCase());
      usedNames.add(best.name.toLowerCase());
      budgetState.discretionary -= bestPrice - worstPrice;
      budgetState.remaining -= bestPrice - worstPrice;
      improved = true;
    }
  }
}

/* ---------------------------------------------------------
   MANA FIXING — multicolour decks need lands that make more than one of
   their colours, the way real Commander decks run shocks, fetches and
   friends. Lands are fetched in three tiers, best first, so an unlimited
   budget takes the premium cycles and a tight one falls through to the
   cheap tapped duals that do the same job. Each tier is one search made
   of plain rules-text matches, filtered afterwards by what the land
   actually produces.
--------------------------------------------------------- */
const FIXING_TIERS = [
  // Untapped or nearly-free: shocks, fetches, surveil lands and triomes,
  // then the original duals. The duals come after because they cost
  // hundreds each and would otherwise take ten slots before any shock or
  // fetch in a no-budget five-colour deck.
  '(o:"pay 2 life" or (o:"pay 1 life, sacrifice" o:"search your library") or o:"surveil 1" or o:"cycling {3}")',
  "is:dual",
  // Solid mid-price cycles: check, fast, slow, battlebond and pain lands,
  // plus any-colour lands such as Command Tower and Exotic Orchard.
  '(o:"unless you control a" or o:"unless you control two or fewer other lands" or o:"unless you control two or more other lands" ' +
    'or o:"unless you control two or more basic lands" or o:"deals 1 damage to you" or o:"mana of any color")',
  // Budget fixing: gain lands, scry lands, guildgates, thriving lands,
  // bounce lands and Evolving Wilds-style fetches.
  '(o:"you gain 1 life" or o:"scry 1" or t:gate or o:"choose a color other than" ' +
    'or o:"return a land you control to its owner\'s hand" or (o:"search your library for a basic land card" o:"sacrifice"))',
];

// How many nonbasic lands a deck runs. Mono-colour decks only want a couple
// of utility lands; multicolour decks lean harder on fixing the more colours
// they have, and more again at higher brackets.
function nonbasicTarget(identity, bracket) {
  // Colourless decks lean on lands like Ancient Tomb and Eldrazi Temple.
  if (identity.length === 0) return 8 + bracket.id;
  if (identity.length === 1) return 1 + (bracket.id - 1);
  // Roughly what real decks run: a two-colour deck around 10 nonbasics, a
  // five-colour deck well over 20.
  const base = { 2: 8, 3: 12, 4: 16 }[identity.length] ?? 19;
  return base + bracket.id;
}

// Keeps a land only if it really fixes for this deck: it makes at least two
// of the deck's colours, or it fetches a basic type the deck plays.
function fixesFor(card, identity) {
  const made = (card.produced_mana || []).filter((c) => identity.includes(c));
  if (made.length >= 2) return true;
  if ((card.produced_mana || []).length) return false;
  const text = (card.oracle_text || card.card_faces?.map((f) => f.oracle_text).join("\n") || "").toLowerCase();
  return text.includes("basic land") || identity.some((c) => text.includes(BASIC_LAND[c].toLowerCase()));
}

async function fetchFixingLands(identity, priceSource) {
  const base = `f:commander id<=${identity.join("").toLowerCase()} t:land -t:basic`;
  // One tier at a time: these run alongside the category searches, and
  // firing them all at once risks Scryfall's rate limit.
  const tiers = [];
  for (const q of FIXING_TIERS) {
    tiers.push(await scryfallSearchCards(`${base} ${q}`, priceSource).catch(() => []));
  }
  const seen = new Set();
  const lands = [];
  tiers.flat().forEach((card) => {
    const key = card.name.toLowerCase();
    if (seen.has(key) || !fixesFor(card, identity)) return;
    seen.add(key);
    lands.push(mapScryfallCard(card));
  });
  return lands;
}

async function buildDeck(commander, style, bracket, opts = {}) {
  const { budget = null, priceSource = "none", themeQuery = null } = opts;
  const identity = commander.identity;
  const recipe = bracket.recipe;
  const usedNames = new Set([commander.name.toLowerCase()]);
  const picks = { ramp: [], draw: [], removal: [], protection: [], synergy: [], wincon: [], utility: [] };
  const cardData = {};
  let nonlandTotal = 0;

  const catKeys = Object.keys(recipe);
  const multicolor = identity.length > 1;
  const [categoryResults, nonbasicRaw, fixingLands] = await Promise.all([
    Promise.all(catKeys.map((cat) => scryfallSearchCards(categoryQuery(cat, identity, commander, style, themeQuery), priceSource).catch(() => []))),
    scryfallSearchCards(`f:commander id<=${identity.join("").toLowerCase() || "c"} t:land -t:basic`, priceSource).catch(() => []),
    multicolor ? fetchFixingLands(identity, priceSource) : Promise.resolve([]),
  ]);

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
    total: budgetActive ? budget : Infinity,
    remaining: budgetActive ? budget : Infinity,
    slotsRemaining: pricedSlots,
    // Money available above the cheapest legal build. Zero means the budget
    // barely covers (or can't cover) a legal 99 — build the cheapest version.
    discretionary: budgetActive ? Math.max(0, budget - baselineCost) : Infinity,
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

  return { picks, nonbasics, basics, budgetActive, budgetRemaining: budgetState.remaining, cardData, shortfall: Math.max(0, deficit) };
}

// Looks up the cheapest priced printing of each named card, a few dozen names
// per search so a whole deck's stragglers cost one or two requests.
async function fetchCheapestPrintings(names, priceSource) {
  const unique = [...new Set(names)];
  const result = {};
  for (let i = 0; i < unique.length; i += 20) {
    const chunk = unique.slice(i, i + 20);
    const query = `(${chunk.map((n) => `!"${n.replace(/"/g, "")}"`).join(" or ")})`;
    const cards = await scryfallSearchCards(query, priceSource);
    cards.map(mapScryfallCard).forEach((c) => { result[c.name.toLowerCase()] = c; });
  }
  return result;
}

/* ---------------------------------------------------------
   SCRYFALL — live card images + prices
   Uses the public /cards/collection endpoint (no API key
   required, CORS-enabled). Scryfall itself aggregates the
   USD price from TCGPlayer and the EUR price from Cardmarket,
   so this is how we surface "TCGPlayer" / "Cardmarket" pricing
   without scraping either retailer directly (which isn't
   something a client-side app can or should do).
--------------------------------------------------------- */
async function fetchScryfallData(names) {
  const unique = [...new Set(names)];
  const chunks = [];
  for (let i = 0; i < unique.length; i += 75) chunks.push(unique.slice(i, i + 75));

  const result = {};
  for (const chunk of chunks) {
    const res = await fetch("https://api.scryfall.com/cards/collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifiers: chunk.map((name) => ({ name })) }),
    });
    if (!res.ok) throw new Error(`Scryfall responded ${res.status}`);
    const json = await res.json();
    (json.data || []).forEach((card) => {
      const faceImages = card.image_uris || card.card_faces?.[0]?.image_uris || null;
      const oracleText = card.oracle_text || card.card_faces?.map((f) => f.oracle_text).filter(Boolean).join("\n\n") || null;
      result[card.name.toLowerCase()] = {
        name: card.name,
        imageSmall: faceImages?.small || null,
        imageLarge: faceImages?.large || faceImages?.png || null,
        priceUsd: card.prices?.usd || card.prices?.usd_foil || null,
        priceEur: card.prices?.eur || card.prices?.eur_foil || null,
        scryfallUri: card.scryfall_uri || null,
        oracleText,
      };
    });
  }
  return result;
}

function scryfallCardPageUrl(name) {
  return `https://scryfall.com/search?q=${encodeURIComponent(`!"${name}"`)}`;
}

function formatPrice(value, source) {
  if (value == null) return "—";
  const n = parseFloat(value);
  if (Number.isNaN(n)) return "—";
  return source === "eur" ? `€${n.toFixed(2)}` : `$${n.toFixed(2)}`;
}

const CAT_LABELS = {
  ramp: "Ramp",
  draw: "Card Draw",
  removal: "Removal & Interaction",
  protection: "Protection",
  synergy: "Synergy & Payoffs",
  wincon: "Win Conditions",
  utility: "Utility",
};

function ColorPips({ identity, size = "md" }) {
  const s = size === "sm" ? "w-5 h-5 text-[10px]" : "w-6 h-6 text-[11px]";
  return (
    <div className="flex gap-1.5 shrink-0">
      {identity.map((c) => (
        <span
          key={c}
          title={COLOR_META[c].label}
          className={`${s} rounded-full border-2 border-black/40 flex items-center justify-center font-bold shadow`}
          style={{ backgroundColor: COLOR_META[c].swatch, color: "#1a1225" }}
        >
          {c}
        </span>
      ))}
    </div>
  );
}

function NumBadge({ n }) {
  return (
    <span className="w-9 h-9 rounded-lg bg-purple-500/20 border border-purple-400/40 text-purple-200 font-bold flex items-center justify-center text-sm shrink-0">
      {n}
    </span>
  );
}

function CardRow({ name, qty, cardData, priceSource, onPreview }) {
  const [hover, setHover] = useState(false);
  const [rect, setRect] = useState(null);
  const rowRef = useRef(null);
  const data = cardData[name.toLowerCase()];
  const price = priceSource === "eur" ? data?.priceEur : data?.priceUsd;
  const showThumb = priceSource !== "none";
  const hasImage = Boolean(data?.imageSmall);

  function updateRect() {
    if (rowRef.current) setRect(rowRef.current.getBoundingClientRect());
  }

  // Re-anchor the preview to the row's live on-screen position whenever the
  // page (or any scrollable ancestor) scrolls while it's showing, instead of
  // relying on a mouse coordinate that goes stale the moment you scroll
  // without also moving the cursor.
  useEffect(() => {
    if (!hover) return;
    const handler = () => updateRect();
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hover]);

  const PREVIEW_W = 240;
  const PREVIEW_H = Math.round(PREVIEW_W * 1.4);
  let left = 0;
  let top = 0;
  if (rect && typeof window !== "undefined") {
    left = rect.right + 12;
    top = rect.top - 14;
    if (left + PREVIEW_W > window.innerWidth) left = rect.left - PREVIEW_W - 12;
    if (top + PREVIEW_H > window.innerHeight) top = window.innerHeight - PREVIEW_H - 8;
    if (top < 8) top = 8;
    if (left < 8) left = 8;
  }

  return (
    <button
      ref={rowRef}
      onClick={() => onPreview({ name, ...(data || {}) })}
      onMouseEnter={() => {
        if (!showThumb || !data?.imageLarge) return;
        updateRect();
        setHover(true);
      }}
      onMouseLeave={() => setHover(false)}
      className={`w-full flex items-center gap-2.5 text-left rounded-lg -mx-1 px-1 py-1 transition ${
        showThumb ? "hover:bg-white/5 cursor-pointer" : "cursor-default"
      }`}
    >
      {showThumb && (
        <span className="w-8 h-6 rounded shrink-0 overflow-hidden bg-white/5 border border-white/10 flex items-center justify-center">
          {hasImage ? (
            <img src={data.imageSmall} alt="" className="w-full h-full object-cover" />
          ) : (
            <ImageOff size={11} className="text-white/20" />
          )}
        </span>
      )}
      <span className="text-sm text-white/85 leading-snug flex-1 min-w-0 truncate">
        {qty > 1 ? `${qty}× ` : ""}{name}
      </span>
      {showThumb && (
        <span className="cf-mono text-[11px] text-white/50 shrink-0">
          {formatPrice(price, priceSource)}
        </span>
      )}

      {hover && showThumb && data?.imageLarge && rect &&
        createPortal(
          <img
            src={data.imageLarge}
            alt=""
            className="fixed z-50 rounded-lg shadow-2xl border border-white/20 pointer-events-none"
            style={{ left, top, width: PREVIEW_W }}
          />,
          document.body
        )}
    </button>
  );
}

function PreviewImage({ imageUrl, name }) {
  if (!imageUrl) {
    return (
      <div className="w-full aspect-[5/7] rounded-xl mb-4 bg-white/5 border border-white/10 flex flex-col items-center justify-center gap-2 text-white/30">
        <ImageOff size={28} />
        <span className="text-xs">Image unavailable</span>
      </div>
    );
  }
  return <img src={imageUrl} alt={name} className="w-full rounded-xl mb-4" />;
}

function CommanderArt({ imageUrl }) {
  if (!imageUrl) {
    return (
      <div className="w-56 sm:w-64 aspect-[5/7] rounded-lg shrink-0 bg-white/5 border border-white/10 flex items-center justify-center text-white/20">
        <ImageOff size={48} />
      </div>
    );
  }
  return <img src={imageUrl} alt="" className="w-56 sm:w-64 rounded-lg shrink-0 border border-white/10 shadow-lg" />;
}


/* ---------------------------------------------------------
   UI
--------------------------------------------------------- */
export default function CommandForge() {
  const [view, setView] = useState("setup");
  const [search, setSearch] = useState("");
  const [selectedCommander, setSelectedCommander] = useState(null);
  const [bracket, setBracket] = useState(null);
  const [inspired, setInspired] = useState(false);
  const [colorFilter, setColorFilter] = useState([]);
  const [houseName, setHouseName] = useState("");
  const [theme, setTheme] = useState("");
  const [deck, setDeck] = useState(null);
  const [savedDecks, setSavedDecks] = useState([]);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [deckName, setDeckName] = useState("");
  const [viewingSaved, setViewingSaved] = useState(null);
  const [priceSource, setPriceSource] = useState("none"); // 'none' | 'usd' | 'eur'
  const [cardData, setCardData] = useState({});
  const [cardDataStatus, setCardDataStatus] = useState("idle"); // idle | loading | done | error
  const [previewCard, setPreviewCard] = useState(null);
  const [budgetInput, setBudgetInput] = useState("");
  const [isForging, setIsForging] = useState(false);

  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [colorMatchCount, setColorMatchCount] = useState(null);
  const [colorMatchLoading, setColorMatchLoading] = useState(false);
  const [colorMatchError, setColorMatchError] = useState(false);
  const [randomizeError, setRandomizeError] = useState(false);
  const [cardmarketCopied, setCardmarketCopied] = useState(false);
  const [cardmarketCopyError, setCardmarketCopyError] = useState(false);

  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState("signin"); // 'signin' | 'signup'
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [decksLoading, setDecksLoading] = useState(false);
  const [deckSaveError, setDeckSaveError] = useState("");

  // Track the Supabase auth session for the lifetime of the app.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Pull this user's saved decks from Supabase whenever they sign in (or
  // clear the local list when they sign out).
  useEffect(() => {
    if (!session) {
      setSavedDecks([]);
      return;
    }
    refreshSavedDecks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function refreshSavedDecks() {
    setDecksLoading(true);
    const { data, error } = await supabase
      .from("decks")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) {
      setSavedDecks(
        data.map((row) => ({
          id: row.id,
          deckName: row.deck_name,
          commander: row.commander,
          identity: row.identity,
          source: row.source,
          bracketName: row.bracket_name,
          picks: row.picks,
          nonbasics: row.nonbasics,
          basics: row.basics,
          priceSource: row.price_source,
          cardData: row.card_data,
        }))
      );
    }
    setDecksLoading(false);
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();
    setAuthError("");
    setAuthNotice("");
    setAuthSubmitting(true);
    try {
      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email: authEmail, password: authPassword });
        if (error) throw error;
        if (!data.session) {
          setAuthNotice("Check your email to confirm your account, then sign in.");
          setAuthMode("signin");
        } else {
          setAuthModalOpen(false);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
        if (error) throw error;
        setAuthModalOpen(false);
      }
      setAuthEmail("");
      setAuthPassword("");
    } catch (err) {
      setAuthError(err.message || "Something went wrong.");
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  // Live-search commanders on Scryfall as the person types. Skips the call
  // entirely once a commander has actually been selected.
  useEffect(() => {
    if (selectedCommander) return;
    setSearchError(false);
    // A slow response for an earlier keystroke mustn't overwrite the results
    // for what's typed now.
    let stale = false;
    const handle = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const { cards } = await scryfallSearchCommanders(buildNameQuery(search));
        if (stale) return;
        const filtered = filterAndSortByName(cards, search);
        setSearchResults(filtered);
        const exact = filtered.find((c) => c.name.toLowerCase() === search.trim().toLowerCase());
        if (exact) setSelectedCommander(exact);
      } catch {
        setSearchError(true);
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 350);
    return () => {
      stale = true;
      clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, selectedCommander]);

  // Live match count for the color-randomizer path.
  useEffect(() => {
    setColorMatchError(false);
    const handle = setTimeout(async () => {
      setColorMatchLoading(true);
      try {
        const { total } = await scryfallSearchCommanders(buildColorQuery(colorFilter, houseName, theme));
        setColorMatchCount(total);
      } catch {
        setColorMatchError(true);
        setColorMatchCount(null);
      } finally {
        setColorMatchLoading(false);
      }
    }, 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorFilter, houseName, theme]);

  // Colourless can't combine with a colour, so picking one clears the other.
  function toggleColor(c) {
    setColorFilter((prev) => {
      if (prev.includes(c)) return prev.filter((x) => x !== c);
      if (c === "C") return ["C"];
      return [...prev.filter((x) => x !== "C"), c];
    });
  }

  async function resolveAndForgeFromSearch() {
    const query = search.trim();
    if (!query || isForging) return;
    setSearchLoading(true);
    try {
      const { cards } = await scryfallSearchCommanders(buildNameQuery(query));
      const filtered = filterAndSortByName(cards, query);
      setSearchResults(filtered);
      const exact = filtered.find((c) => c.name.toLowerCase() === query.toLowerCase());
      const resolved = selectedCommander || exact || filtered[0];
      if (!resolved) return;
      setSelectedCommander(resolved);
      setSearch(resolved.name);
      if (bracket) await forgeWith(resolved, bracket);
    } catch {
      setSearchError(true);
    } finally {
      setSearchLoading(false);
    }
  }

  const parsedBudget = budgetInput.trim() ? parseFloat(budgetInput) : null;

  function deckTotalPrice() {
    if (!deck || priceSource === "none") return null;
    let total = 0;
    let anyPriced = false;
    Object.values(deck.picks).flat().forEach((c) => {
      const d = cardData[c.name.toLowerCase()];
      const p = priceSource === "eur" ? d?.priceEur : d?.priceUsd;
      if (p != null) { total += parseFloat(p); anyPriced = true; }
    });
    // Basics are left out on purpose, matching the budget (which never
    // charges for them) and the note shown under the land list.
    deck.nonbasics.forEach((l) => {
      const d = cardData[l.name.toLowerCase()];
      const p = priceSource === "eur" ? d?.priceEur : d?.priceUsd;
      if (p != null) { total += parseFloat(p) * l.qty; anyPriced = true; }
    });
    return anyPriced ? total : null;
  }

  // Fetches (or reuses cached) prices for the whole eligible card pool, then
  // builds the deck against real prices, then reuses that same data to show
  // images/prices/total on the result screen — all triggered by the click,
  // not preloaded before the person has even picked a commander.
  async function forgeWith(commander, activeBracket, usedTheme = null) {
    setIsForging(true);
    setCardDataStatus("loading");
    try {
      // A chosen theme is as strong a signal as the EDHREC-inspired toggle
      // that the supporting 99 should lean into a specific archetype, so it
      // forces archetype-aware building even if that toggle is off.
      const buildStyle = inspired || usedTheme ? "edhrec" : "random";
      const built = await buildDeck(commander, buildStyle, activeBracket, {
        budget: parsedBudget,
        priceSource,
        themeQuery: usedTheme ? resolveThemeQuery(usedTheme) : null,
      });
      setDeck({
        commander,
        // The style actually used, so a theme-driven build isn't described
        // as "randomly assembled".
        style: buildStyle,
        theme: usedTheme,
        shortfall: built.shortfall,
        bracket: activeBracket,
        budgetTarget: parsedBudget,
        picks: built.picks,
        nonbasics: built.nonbasics,
        basics: built.basics,
      });

      // The commander's own image/price/oracle text already came back with
      // the search or randomize call, so fold it in directly. Its price falls
      // back to the cheapest-printing lookup buildDeck did when the printing
      // the search returned had none.
      const backfilled = built.cardData[commander.name.toLowerCase()];
      const commanderEntry = {
        name: commander.name,
        imageSmall: commander.imageSmall,
        imageLarge: commander.imageLarge,
        priceUsd: commander.priceUsd ?? backfilled?.priceUsd ?? null,
        priceEur: commander.priceEur ?? backfilled?.priceEur ?? null,
        scryfallUri: commander.scryfallUri,
        oracleText: commander.oracleText,
      };
      setCardData({ ...built.cardData, [commander.name.toLowerCase()]: commanderEntry });
      setCardDataStatus("done");
    } catch {
      setCardDataStatus("error");
    } finally {
      setIsForging(false);
      setView("result");
    }
  }

  async function forge() {
    if (!selectedCommander || !bracket) return;
    await forgeWith(selectedCommander, bracket);
  }

  async function randomizeCommander() {
    if (!bracket) return;
    setRandomizeError(false);
    setIsForging(true);
    try {
      const commander = await scryfallRandomCommander(buildColorQuery(colorFilter, houseName, theme));
      if (!commander) {
        setRandomizeError(true);
        setIsForging(false);
        return;
      }
      setSelectedCommander(commander);
      await forgeWith(commander, bracket, theme);
    } catch {
      setRandomizeError(true);
      setIsForging(false);
    }
  }

  // cardData holds every candidate Scryfall returned (well over a thousand
  // cards with rules text), so a saved deck keeps only its own cards.
  function deckCardData(d, data) {
    const names = [
      d.commander.name,
      ...Object.values(d.picks).flat().map((c) => c.name),
      ...d.nonbasics.map((l) => l.name),
      ...d.basics.map((l) => l.name),
    ];
    const out = {};
    names.forEach((n) => {
      const entry = data[n.toLowerCase()];
      if (entry) out[n.toLowerCase()] = entry;
    });
    return out;
  }

  async function saveDeck() {
    if (!deck || !session) return;
    setDeckSaveError("");
    const { error } = await supabase.from("decks").insert({
      user_id: session.user.id,
      deck_name: deckName.trim() || `${deck.commander.name} Deck`,
      commander: deck.commander.name,
      identity: deck.commander.identity,
      source: deck.style === "edhrec" ? "edhrec_inspired" : "random",
      bracket_name: deck.bracket.name,
      picks: deck.picks,
      nonbasics: deck.nonbasics,
      basics: deck.basics,
      price_source: priceSource,
      card_data: priceSource !== "none" ? deckCardData(deck, cardData) : {},
    });
    if (error) {
      setDeckSaveError(error.message || "Couldn't save this deck.");
      return;
    }
    await refreshSavedDecks();
    setSaveModalOpen(false);
    setDeckName("");
  }

  // Cardmarket's wants-list importer accepts plain "<quantity> <card name>"
  // lines pasted straight in — confirmed via their own help docs. Basics are
  // left out since nobody actually needs to buy Plains/Islands.
  function cardmarketList(commanderName, picks, nonbasics) {
    const lines = [`1 ${commanderName}`];
    Object.values(picks).flat().forEach((c) => lines.push(`1 ${c.name}`));
    nonbasics.forEach((l) => lines.push(`${l.qty} ${l.name}`));
    return lines.join("\n");
  }

  async function copyForCardmarket(commanderName, picks, nonbasics) {
    const text = cardmarketList(commanderName, picks, nonbasics);
    try {
      await navigator.clipboard.writeText(text);
      setCardmarketCopied(true);
      setTimeout(() => setCardmarketCopied(false), 2000);
    } catch {
      setCardmarketCopyError(true);
      setTimeout(() => setCardmarketCopyError(false), 2500);
    }
  }

  async function deleteDeck(id) {
    if (viewingSaved?.id === id) setViewingSaved(null);
    setSavedDecks((prev) => prev.filter((d) => d.id !== id)); // optimistic
    const { error } = await supabase.from("decks").delete().eq("id", id);
    // If the delete didn't go through, put the list back as it really is
    // rather than leaving a deck that reappears on the next visit.
    if (error) await refreshSavedDecks();
  }

  function reset() {
    setView("setup");
    setSearch("");
    setSelectedCommander(null);
    setBracket(null);
    setInspired(false);
    setColorFilter([]);
    setHouseName("");
    setDeck(null);
    setCardData({});
    setCardDataStatus("idle");
  }

  return (
    <div className="min-h-screen w-full text-white" style={{ fontFamily: "'Manrope', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;900&family=Manrope:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap');
        .cf-display { font-family: 'Cinzel', serif; letter-spacing: 0.02em; }
        .cf-mono { font-family: 'JetBrains Mono', monospace; }
        .cf-bg {
          background-color: #0B0812;
          background-image: radial-gradient(ellipse 900px 500px at 50% 0%, rgba(88,58,120,0.45), transparent 70%);
        }
        .cf-panel { background-color: #150F20; border: 1px solid rgba(255,255,255,0.08); }
        .cf-panel-alt { background-color: #0F0A18; border: 1px solid rgba(255,255,255,0.06); }
        .cf-gold { color: #E3B25C; }
        .cf-badge { background-color: rgba(60,40,20,0.55); border: 1px solid rgba(227,178,92,0.4); color: #E3B25C; }
        @keyframes cfFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .cf-fade { animation: cfFade .4s ease-out both; }
      `}</style>

      <div className="cf-bg min-h-screen">
        <header className="bg-black border-b border-white/10 sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-5 py-4 flex items-center justify-between gap-4">
            <button onClick={reset} className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-[#E3B25C] flex items-center justify-center text-black shrink-0">
                <Swords size={20} strokeWidth={2.5} />
              </span>
              <span className="cf-display text-lg text-white">Commander Forge</span>
            </button>
            <div className="flex items-center gap-2">
              <nav className="flex items-center gap-1">
                <button
                  onClick={() => setView("setup")}
                  className={`px-4 py-2 rounded-full text-sm font-semibold transition ${
                    view !== "decks" ? "bg-[#E3B25C] text-black" : "text-white/70 hover:text-white"
                  }`}
                >
                  Forge
                </button>
                <button
                  onClick={() => setView("decks")}
                  className={`px-4 py-2 rounded-full text-sm font-semibold transition ${
                    view === "decks" ? "bg-[#E3B25C] text-black" : "text-white/70 hover:text-white"
                  }`}
                >
                  My Decks{savedDecks.length > 0 ? ` (${savedDecks.length})` : ""}
                </button>
              </nav>
              <div className="w-px h-6 bg-white/15 mx-1 hidden sm:block" />
              {authLoading ? (
                <Loader2 size={16} className="animate-spin text-white/30" />
              ) : session ? (
                <button
                  onClick={handleSignOut}
                  title={session.user.email}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold text-white/70 hover:text-white transition"
                >
                  <User size={14} />
                  <span className="hidden sm:inline max-w-[120px] truncate">{session.user.email}</span>
                  <LogOut size={13} />
                </button>
              ) : (
                <button
                  onClick={() => {
                    setAuthMode("signin");
                    setAuthError("");
                    setAuthNotice("");
                    setAuthModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold border border-white/20 text-white/80 hover:border-white/40 hover:text-white transition"
                >
                  <User size={14} /> Sign In
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-5 py-12">
          {view === "setup" && (
            <div className="cf-fade">
              <div className="text-center mb-10">
                <div className="inline-flex items-center gap-2 cf-badge rounded-full px-4 py-1.5 text-xs font-bold tracking-widest mb-6">
                  <Sparkles size={13} />
                  POWERED BY LIVE SCRYFALL DATA
                </div>
                <h1 className="cf-display text-4xl sm:text-5xl text-white mb-4 leading-tight">Commander Forge</h1>
                <p className="text-white/60 text-base max-w-lg mx-auto leading-relaxed">
                  Search a commander, pick a power bracket, and get a legal, playable 99-card decklist tuned for that level of play.
                </p>
              </div>

              <div className="cf-panel rounded-2xl p-6 mb-5">
                <div className="relative mb-2">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35" />
                  <input
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setSelectedCommander(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      resolveAndForgeFromSearch();
                    }}
                    placeholder="Search any commander ever printed…"
                    className="w-full bg-black/40 border border-white/15 rounded-xl pl-10 pr-3 py-3.5 text-sm text-white placeholder-white/35 outline-none focus:border-[#E3B25C]/60"
                  />
                </div>
                <p className="text-[11px] text-white/30 mb-2">Live search via Scryfall — every legal commander, not a fixed list.</p>

                {selectedCommander && (
                  <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-purple-400/50 bg-purple-500/10 mb-1">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{selectedCommander.name}</p>
                      <p className="text-xs text-white/50 truncate">{selectedCommander.blurb}</p>
                    </div>
                    <ColorPips identity={selectedCommander.identity} size="sm" />
                  </div>
                )}

                {!selectedCommander && searchLoading && (
                  <p className="text-xs text-white/40 py-3 text-center flex items-center justify-center gap-1.5">
                    <Loader2 size={12} className="animate-spin" /> Searching Scryfall…
                  </p>
                )}

                {!selectedCommander && !searchLoading && searchError && (
                  <p className="text-xs text-red-300/70 py-3 text-center">Couldn't reach Scryfall — check your connection and try again.</p>
                )}

                {!selectedCommander && !searchLoading && !searchError && search.trim() && searchResults.length === 0 && (
                  <p className="text-xs text-white/40 py-3 text-center">No commander found for "{search.trim()}".</p>
                )}

                {!selectedCommander && !searchLoading && !searchError && searchResults.length > 0 && (
                  <div className="max-h-56 overflow-y-auto space-y-1.5">
                    {searchResults.map((c) => (
                      <button
                        key={c.name}
                        onClick={() => {
                          setSelectedCommander(c);
                          setSearch(c.name);
                        }}
                        className="w-full text-left px-4 py-2.5 rounded-xl border border-transparent bg-black/30 hover:border-white/15 flex items-center justify-between gap-3 transition"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{c.name}</p>
                          <p className="text-xs text-white/50 truncate">{c.blurb}</p>
                        </div>
                        <ColorPips identity={c.identity} size="sm" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="cf-panel rounded-2xl p-6 mb-5">
                <p className="text-xs text-white/50 mb-4 tracking-widest font-semibold uppercase">Power Bracket</p>
                <div className="grid grid-cols-2 gap-3">
                  {BRACKETS.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => setBracket(b)}
                      className={`text-left px-4 py-3.5 rounded-xl border transition ${
                        bracket?.id === b.id
                          ? "border-purple-400 bg-purple-500/15 shadow-[0_0_0_1px_rgba(167,139,250,0.4),0_0_24px_-8px_rgba(167,139,250,0.6)]"
                          : "border-white/12 bg-black/30 hover:border-white/25"
                      }`}
                    >
                      <p className="text-sm font-bold text-white">{b.id}. {b.name}</p>
                      <p className="text-xs text-white/50 mt-0.5">{b.tag}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="cf-panel rounded-2xl p-6 mb-5">
                <p className="text-xs text-white/50 mb-4 tracking-widest font-semibold uppercase">Deck Style</p>
                <button
                  onClick={() => setInspired((v) => !v)}
                  className="w-full flex items-center justify-between gap-4 px-4 py-4 rounded-xl border border-white/12 bg-black/30 text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Lightbulb size={18} className="text-white/40 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">Inspired by real decks</p>
                      <p className="text-xs text-white/50 mt-0.5">Leans into cards matching your commander's known archetype</p>
                    </div>
                  </div>
                  <span className={`w-11 h-6 rounded-full shrink-0 flex items-center px-0.5 transition ${inspired ? "bg-purple-500 justify-end" : "bg-white/15 justify-start"}`}>
                    <span className="w-5 h-5 rounded-full bg-white block" />
                  </span>
                </button>
              </div>

              <div className="cf-panel rounded-2xl p-6 mb-5">
                <p className="text-xs text-white/50 mb-4 tracking-widest font-semibold uppercase">Card Images & Pricing</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  {[
                    { id: "none", label: "No Pricing" },
                    { id: "usd", label: "TCGPlayer ($)" },
                    { id: "eur", label: "Cardmarket (€)" },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setPriceSource(opt.id)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition ${
                        priceSource === opt.id
                          ? "border-purple-400 bg-purple-500/20 text-white"
                          : "border-white/12 bg-black/30 text-white/70 hover:border-white/25"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {priceSource !== "none" && (
                  <p className="text-xs text-white/40 mt-3 leading-relaxed">
                    Images and prices are pulled live from Scryfall, which itself sources USD pricing from TCGPlayer and EUR pricing from Cardmarket.
                  </p>
                )}

                {priceSource !== "none" && (
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <p className="text-xs text-white/50 mb-2 font-semibold">Budget (optional)</p>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40 text-sm">
                        {priceSource === "eur" ? "€" : "$"}
                      </span>
                      <input
                        type="number"
                        min="0"
                        inputMode="decimal"
                        value={budgetInput}
                        onChange={(e) => setBudgetInput(e.target.value)}
                        placeholder="No limit — leans into pricier staples"
                        className="w-full bg-black/40 border border-white/15 rounded-xl pl-7 pr-3 py-3 text-sm text-white placeholder-white/35 outline-none focus:border-[#E3B25C]/60"
                      />
                    </div>
                    <p className="text-xs text-white/40 mt-2 leading-relaxed">
                      {budgetInput.trim()
                        ? "The builder spreads this across the whole deck — no single card takes more than about a fifth of it — then spends up toward the total on stronger cards."
                        : "Leave this blank and the builder favors pricier, higher-power staples instead of budget alternatives."}
                    </p>
                  </div>
                )}
              </div>

              <button
                onClick={forge}
                disabled={!selectedCommander || !bracket || isForging}
                className="w-full py-3.5 rounded-xl border-2 border-[#E3B25C]/70 bg-[#E3B25C]/15 hover:bg-[#E3B25C]/25 disabled:border-white/15 disabled:bg-white/5 disabled:text-white/25 disabled:cursor-not-allowed transition text-white font-semibold text-sm flex items-center justify-center gap-2 mb-8"
              >
                {isForging ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {isForging ? "Forging…" : "Forge Commander Deck"}
              </button>

              <div className="flex items-center gap-3 mb-6">
                <div className="h-px bg-white/10 flex-1" />
                <p className="text-xs text-white/40 tracking-widest font-semibold uppercase">or randomize by color</p>
                <div className="h-px bg-white/10 flex-1" />
              </div>

              <div className="cf-panel rounded-2xl p-6 mb-8">
                <div className="flex justify-center gap-3 mb-4">
                  {["W", "U", "B", "R", "G", "C"].map((c) => (
                    <button
                      key={c}
                      onClick={() => toggleColor(c)}
                      title={COLOR_META[c].label}
                      className={`w-11 h-11 rounded-full border-2 flex items-center justify-center font-bold text-sm transition ${
                        colorFilter.includes(c) ? "border-transparent" : "border-white/20 text-white/50 hover:border-white/40"
                      }`}
                      style={colorFilter.includes(c) ? { backgroundColor: COLOR_META[c].swatch, color: "#1a1225" } : {}}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <div className="relative mb-3">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35" />
                  <input
                    value={houseName}
                    onChange={(e) => setHouseName(e.target.value)}
                    placeholder="Or type a house name — Azorius, Grixis…"
                    className="w-full bg-black/40 border border-white/15 rounded-xl pl-10 pr-3 py-3 text-sm text-white placeholder-white/35 outline-none focus:border-[#E3B25C]/60"
                  />
                </div>
                <p className="text-center text-xs text-white/40 mb-4">
                  {colorFilter.length === 0 && !houseName.trim()
                    ? "Any color identity"
                    : colorMatchLoading
                    ? "Checking Scryfall…"
                    : colorMatchError
                    ? "Couldn't reach Scryfall"
                    : colorMatchCount === 0
                    ? "No legal commander fits this combo"
                    : houseName.trim()
                    ? `${colorMatchCount ?? "…"} commander${colorMatchCount === 1 ? "" : "s"} match`
                    : houseNameForColors(colorFilter)}
                </p>

                <div className="mb-4">
                  <label className="block text-[11px] text-white/40 uppercase tracking-wide font-semibold mb-1.5">
                    Deck theme (optional) — type anything
                  </label>
                  <input
                    value={theme}
                    onChange={(e) => setTheme(e.target.value)}
                    placeholder="e.g. lifegain, voltron, dragons, mill…"
                    className="w-full bg-black/40 border border-white/15 rounded-xl px-3 py-3 text-sm text-white placeholder-white/35 outline-none focus:border-[#E3B25C]/60"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {THEME_SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setTheme(s)}
                        className="text-[11px] px-2.5 py-1 rounded-full border border-white/15 text-white/50 hover:text-white hover:border-white/35 transition"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl bg-black/30 border border-white/10 px-4 py-3 mb-4">
                  <p className="text-[11px] text-white/40 uppercase tracking-wide font-semibold mb-1">This will also use</p>
                  <p className="text-xs text-white/70 leading-relaxed">
                    Bracket: <span className="text-white font-semibold">{bracket ? `${bracket.id} · ${bracket.name}` : "none selected yet"}</span>
                    {priceSource !== "none" && (
                      <>
                        {" · "}Budget: <span className="text-white font-semibold">{parsedBudget ? formatPrice(parsedBudget, priceSource) : "no limit"}</span>
                      </>
                    )}
                    {theme.trim() && (
                      <>
                        {" · "}Theme: <span className="text-white font-semibold">{theme.trim()}</span>
                      </>
                    )}
                  </p>
                  {!bracket && (
                    <p className="text-xs text-amber-400/80 mt-1">Pick a Power Bracket above first — it applies to Randomize too.</p>
                  )}
                  {randomizeError && (
                    <p className="text-xs text-red-300/80 mt-1">Couldn't fetch a commander from Scryfall — try again.</p>
                  )}
                </div>

                <button
                  onClick={randomizeCommander}
                  disabled={colorMatchCount === 0 || !bracket || isForging}
                  className="w-full py-3.5 rounded-xl border-2 border-purple-400/60 bg-purple-500/15 hover:bg-purple-500/25 disabled:border-white/15 disabled:bg-white/5 disabled:text-white/25 disabled:cursor-not-allowed text-white font-semibold text-sm flex items-center justify-center gap-2 transition"
                >
                  {isForging ? <Loader2 size={16} className="animate-spin" /> : <Shuffle size={16} />}
                  {isForging ? "Forging…" : "Randomize Commander"}
                </button>
              </div>

              <div className="space-y-3">
                {[
                  { n: 1, title: "Color-identity legal", desc: "Every card respects your commander's color identity — fully Commander-legal." },
                  { n: 2, title: "Bracket-aware", desc: "Ramp, removal, and win-condition density scale with the bracket you choose." },
                  { n: 3, title: "Runs in your browser", desc: "No login and no server — decks are saved for this session only." },
                ].map((f) => (
                  <div key={f.n} className="cf-panel-alt rounded-xl p-4 flex items-start gap-4">
                    <NumBadge n={f.n} />
                    <div>
                      <p className="text-sm font-bold text-white">{f.title}</p>
                      <p className="text-xs text-white/50 mt-1 leading-relaxed">{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {view === "result" && deck && (
            <div className="cf-fade">
              <button onClick={reset} className="flex items-center gap-1 text-sm text-white/50 hover:text-white/80 mb-5 transition">
                <ChevronLeft size={16} /> Back
              </button>

              <div className="cf-panel rounded-2xl p-6 mb-6">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="cf-mono text-[11px] cf-gold font-semibold tracking-wide">
                    {deck.style === "edhrec" ? "EDHREC-INSPIRED" : "RANDOM BUILD"}
                  </span>
                  <span className="text-white/30">·</span>
                  <span className="cf-mono text-[11px] text-purple-300 font-semibold tracking-wide">
                    BRACKET {deck.bracket.id} · {deck.bracket.name.toUpperCase()}
                  </span>
                </div>
                <div className="flex items-start gap-4 flex-wrap">
                  {priceSource !== "none" && <CommanderArt imageUrl={deck.commander.imageLarge} />}
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="min-w-0">
                        <h2 className="cf-display text-2xl sm:text-3xl text-white break-words">{deck.commander.name}</h2>
                        <p className="text-sm text-white/55 mt-1.5">{deck.commander.blurb}</p>
                      </div>
                      <ColorPips identity={deck.commander.identity} />
                    </div>
                    {priceSource !== "none" && (
                      <p className="text-xs text-white/45 leading-relaxed whitespace-pre-line mt-2.5">
                        {cardDataStatus === "loading"
                          ? "Loading card text…"
                          : cardData[deck.commander.name.toLowerCase()]?.oracleText || "Card text unavailable."}
                      </p>
                    )}
                  </div>
                </div>

                <p className="text-sm text-white/70 leading-relaxed mt-4 pt-4 border-t border-white/10">
                  {describeDeck(deck)}
                </p>

                {priceSource !== "none" && (
                  <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
                    <span className="text-xs text-white/50">
                      Estimated deck total ({priceSource === "eur" ? "Cardmarket" : "TCGPlayer"})
                    </span>
                    {cardDataStatus === "loading" ? (
                      <span className="flex items-center gap-1.5 text-xs text-white/50">
                        <Loader2 size={12} className="animate-spin" /> Fetching prices…
                      </span>
                    ) : cardDataStatus === "error" ? (
                      <span className="text-xs text-red-300/80">Price data unavailable</span>
                    ) : (
                      <span className="cf-mono text-sm cf-gold font-semibold">
                        {deckTotalPrice() != null ? formatPrice(deckTotalPrice(), priceSource) : "—"}
                      </span>
                    )}
                  </div>
                )}

                {priceSource !== "none" && cardDataStatus === "done" && deck.budgetTarget != null && deckTotalPrice() != null && (
                  <p className={`text-xs mt-2 text-right ${deckTotalPrice() <= deck.budgetTarget ? "text-green-400/80" : "text-amber-400/80"}`}>
                    {deckTotalPrice() <= deck.budgetTarget
                      ? `Under your ${formatPrice(deck.budgetTarget, priceSource)} budget by ${formatPrice(deck.budgetTarget - deckTotalPrice(), priceSource)}`
                      : `${formatPrice(deckTotalPrice() - deck.budgetTarget, priceSource)} over your ${formatPrice(deck.budgetTarget, priceSource)} budget — not enough cheap eligible cards to fit every slot`}
                  </p>
                )}
              </div>

              {cardDataStatus === "done" && deck.shortfall > 0 && (
                <div className="cf-panel rounded-xl p-4 mb-4 border-amber-400/30">
                  <p className="text-xs text-white/60 leading-relaxed">
                    Scryfall didn't return enough cards to fill {deck.shortfall} spell slot{deck.shortfall === 1 ? "" : "s"}, so {deck.shortfall === 1 ? "an extra basic land was" : `${deck.shortfall} extra basic lands were`} added instead. That happens when a narrow theme or colour combination has few matching cards, or when Scryfall was briefly busy, in which case forging again usually fixes it.
                  </p>
                </div>
              )}

              {cardDataStatus === "error" && (
                <div className="cf-panel rounded-xl p-4 mb-4 border-red-400/30">
                  <p className="text-xs text-white/60 leading-relaxed">
                    Couldn't reach Scryfall to source this deck's cards — every category and land now pulls live from their API, so this needs a working connection. Check your internet connection and try forging again. If some categories partially loaded, you may see a lighter deck below with extra basic lands filling the gap.
                  </p>
                </div>
              )}

              <div className="space-y-3 mb-6">
                {Object.entries(deck.picks).map(([cat, cards]) =>
                  cards.length ? (
                    <div key={cat} className="cf-panel-alt rounded-xl p-4">
                      <p className="cf-mono text-[11px] cf-gold font-semibold mb-2.5 tracking-wide">
                        {CAT_LABELS[cat].toUpperCase()} · {cards.length}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                        {cards.map((c) => (
                          <CardRow
                            key={c.name}
                            name={c.name}
                            qty={1}
                            cardData={cardData}
                            priceSource={priceSource}
                            onPreview={setPreviewCard}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null
                )}

                <div className="cf-panel-alt rounded-xl p-4">
                  <p className="cf-mono text-[11px] cf-gold font-semibold mb-2.5 tracking-wide">
                    LANDS · {deck.nonbasics.reduce((a, l) => a + l.qty, 0) + deck.basics.reduce((a, l) => a + l.qty, 0)}
                  </p>
                  {priceSource !== "none" && deck.basics.length > 0 && (
                    <p className="text-xs text-white/50 mb-2.5">
                      Basic lands aren't priced or counted in the deck total or budget. They cost pennies each, and most players already have plenty.
                    </p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                    {[...deck.nonbasics, ...deck.basics].map((l) => (
                      <CardRow
                        key={l.name}
                        name={l.name}
                        qty={l.qty}
                        cardData={cardData}
                        priceSource={priceSource}
                        onPreview={setPreviewCard}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 mb-3">
                <button
                  onClick={() => {
                    if (session) {
                      setSaveModalOpen(true);
                    } else {
                      setAuthMode("signin");
                      setAuthError("");
                      setAuthNotice("Sign in (or create a free account) to save this deck.");
                      setAuthModalOpen(true);
                    }
                  }}
                  className="flex-1 py-3.5 rounded-xl border-2 border-[#E3B25C]/70 bg-[#E3B25C]/15 hover:bg-[#E3B25C]/25 transition text-white font-semibold text-sm flex items-center justify-center gap-2"
                >
                  <Save size={15} /> {session ? "Save Deck" : "Sign In to Save"}
                </button>
                <button
                  onClick={reset}
                  className="flex-1 py-3.5 rounded-xl border-2 border-white/25 bg-white/5 hover:bg-white/10 transition text-white/85 font-semibold text-sm flex items-center justify-center gap-2"
                >
                  Forge Another
                </button>
              </div>

              <button
                onClick={() => copyForCardmarket(deck.commander.name, deck.picks, deck.nonbasics)}
                className="w-full py-3 rounded-xl border-2 border-white/15 bg-white/5 hover:bg-white/10 transition text-white/75 font-semibold text-sm flex items-center justify-center gap-2"
              >
                {cardmarketCopied ? (
                  <>
                    <Check size={15} className="text-green-400" /> Copied — paste straight into a Cardmarket Wants list
                  </>
                ) : cardmarketCopyError ? (
                  <>Couldn't copy — your browser may be blocking clipboard access</>
                ) : (
                  <>
                    <ClipboardCopy size={15} /> Copy for Cardmarket Wants List
                  </>
                )}
              </button>
            </div>
          )}

          {view === "decks" && (
            <div className="cf-fade">
              <h1 className="cf-display text-3xl text-white mb-1.5">My Decks</h1>
              <p className="text-xs text-white/40 mb-6">
                {session
                  ? "Synced to your account — available on any device you sign in on."
                  : "Sign in to save decks to your account and access them anywhere."}
              </p>

              {!session && (
                <div className="cf-panel rounded-2xl p-10 text-center border-dashed mb-4">
                  <p className="text-white/50 text-sm mb-4">Sign in or create a free account to save and sync decks.</p>
                  <button
                    onClick={() => {
                      setAuthMode("signin");
                      setAuthError("");
                      setAuthNotice("");
                      setAuthModalOpen(true);
                    }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 border-[#E3B25C]/70 bg-[#E3B25C]/15 hover:bg-[#E3B25C]/25 transition text-white font-semibold text-sm"
                  >
                    <User size={15} /> Sign In / Sign Up
                  </button>
                </div>
              )}

              {session && decksLoading && (
                <p className="text-xs text-white/40 mb-4 flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin" /> Loading your decks…
                </p>
              )}

              {session && !decksLoading && savedDecks.length === 0 && (
                <div className="cf-panel rounded-2xl p-10 text-center border-dashed">
                  <p className="text-white/50 text-sm">No decks saved yet. Forge one and hit "Save Deck".</p>
                </div>
              )}

              <div className="space-y-3">
                {savedDecks.map((d) => (
                  <div key={d.id} className="cf-panel rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white break-words">{d.deckName}</p>
                        <p className="text-xs text-white/50 mt-0.5">
                          {d.commander} · {d.source === "edhrec_inspired" ? "EDHREC-inspired" : "Random"} · {d.bracketName}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <ColorPips identity={d.identity} size="sm" />
                        <button
                          onClick={() => setViewingSaved(viewingSaved?.id === d.id ? null : d)}
                          className="text-xs font-semibold cf-gold hover:text-white underline underline-offset-2"
                        >
                          {viewingSaved?.id === d.id ? "Hide" : "View"}
                        </button>
                        <button
                          onClick={() => deleteDeck(d.id)}
                          className="text-xs font-semibold text-red-400/80 hover:text-red-300 underline underline-offset-2"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {viewingSaved?.id === d.id && (
                      <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
                        {Object.entries(d.picks).map(([cat, cards]) =>
                          cards.length ? (
                            <div key={cat}>
                              <p className="cf-mono text-[10px] cf-gold font-semibold mb-1.5 tracking-wide">
                                {CAT_LABELS[cat].toUpperCase()} · {cards.length}
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                                {cards.map((c) => (
                                  <CardRow
                                    key={c.name}
                                    name={c.name}
                                    qty={1}
                                    cardData={d.cardData || {}}
                                    priceSource={d.priceSource || "none"}
                                    onPreview={setPreviewCard}
                                  />
                                ))}
                              </div>
                            </div>
                          ) : null
                        )}
                        <div>
                          <p className="cf-mono text-[10px] cf-gold font-semibold mb-1.5 tracking-wide">LANDS</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                            {[...d.nonbasics, ...d.basics].map((l) => (
                              <CardRow
                                key={l.name}
                                name={l.name}
                                qty={l.qty}
                                cardData={d.cardData || {}}
                                priceSource={d.priceSource || "none"}
                                onPreview={setPreviewCard}
                              />
                            ))}
                          </div>
                        </div>
                        <button
                          onClick={() => copyForCardmarket(d.commander, d.picks, d.nonbasics)}
                          className="w-full py-2.5 rounded-xl border-2 border-white/15 bg-white/5 hover:bg-white/10 transition text-white/75 font-semibold text-xs flex items-center justify-center gap-2"
                        >
                          {cardmarketCopied ? (
                            <>
                              <Check size={13} className="text-green-400" /> Copied
                            </>
                          ) : (
                            <>
                              <ClipboardCopy size={13} /> Copy for Cardmarket Wants List
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>

      {saveModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-20">
          <div className="cf-panel rounded-2xl p-6 w-full max-w-sm">
            <h3 className="cf-display text-lg text-white mb-4">Name This Deck</h3>
            <input
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              placeholder={`${deck?.commander.name} Deck`}
              className="w-full bg-black/40 border border-white/15 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/35 mb-2 outline-none focus:border-[#E3B25C]/60"
              autoFocus
            />
            {deckSaveError && <p className="text-xs text-red-300/80 mb-2">{deckSaveError}</p>}
            <div className="flex gap-3 mt-2">
              <button
                onClick={saveDeck}
                className="flex-1 py-2.5 rounded-xl border-2 border-[#E3B25C]/70 bg-[#E3B25C]/15 hover:bg-[#E3B25C]/25 text-white font-semibold text-sm transition"
              >
                Save
              </button>
              <button
                onClick={() => setSaveModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl border-2 border-white/25 bg-white/5 hover:bg-white/10 text-white/85 font-semibold text-sm transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {authModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-20" onClick={() => setAuthModalOpen(false)}>
          <div className="cf-panel rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="cf-display text-lg text-white">{authMode === "signup" ? "Create Account" : "Sign In"}</h3>
              <button onClick={() => setAuthModalOpen(false)} className="text-white/40 hover:text-white transition">
                <X size={18} />
              </button>
            </div>

            <div className="flex gap-2 mb-4">
              <button
                onClick={() => { setAuthMode("signin"); setAuthError(""); setAuthNotice(""); }}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${
                  authMode === "signin" ? "bg-purple-500/20 text-white border border-purple-400/50" : "text-white/50 border border-white/10"
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => { setAuthMode("signup"); setAuthError(""); setAuthNotice(""); }}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${
                  authMode === "signup" ? "bg-purple-500/20 text-white border border-purple-400/50" : "text-white/50 border border-white/10"
                }`}
              >
                Create Account
              </button>
            </div>

            <form onSubmit={handleAuthSubmit}>
              <input
                type="email"
                required
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="Email"
                className="w-full bg-black/40 border border-white/15 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/35 mb-2 outline-none focus:border-purple-400/60"
              />
              <input
                type="password"
                required
                minLength={6}
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="Password"
                className="w-full bg-black/40 border border-white/15 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/35 mb-3 outline-none focus:border-purple-400/60"
              />

              {authNotice && <p className="text-xs cf-gold mb-3">{authNotice}</p>}
              {authError && <p className="text-xs text-red-300/80 mb-3">{authError}</p>}

              <button
                type="submit"
                disabled={authSubmitting}
                className="w-full py-2.5 rounded-xl border-2 border-purple-400/60 bg-purple-500/15 hover:bg-purple-500/25 disabled:opacity-50 text-white font-semibold text-sm transition flex items-center justify-center gap-2"
              >
                {authSubmitting && <Loader2 size={14} className="animate-spin" />}
                {authMode === "signup" ? "Create Account" : "Sign In"}
              </button>
            </form>
          </div>
        </div>
      )}

      {previewCard && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-6 z-20" onClick={() => setPreviewCard(null)}>
          <div className="cf-panel rounded-2xl p-5 w-full max-w-xs" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-end mb-2">
              <button onClick={() => setPreviewCard(null)} className="text-white/40 hover:text-white transition">
                <X size={18} />
              </button>
            </div>
            <PreviewImage imageUrl={previewCard.imageLarge} name={previewCard.name} />
            <p className="text-sm font-semibold text-white mb-1">{previewCard.name}</p>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-white/50">
                {priceSource === "eur" ? "Cardmarket" : "TCGPlayer"} price
              </span>
              <span className="cf-mono text-sm cf-gold font-semibold">
                {formatPrice(priceSource === "eur" ? previewCard.priceEur : previewCard.priceUsd, priceSource)}
              </span>
            </div>
            <a
              href={previewCard.scryfallUri || scryfallCardPageUrl(previewCard.name)}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-white/25 bg-white/5 hover:bg-white/10 text-white/85 font-semibold text-sm transition"
            >
              View on Scryfall <ExternalLink size={14} />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
