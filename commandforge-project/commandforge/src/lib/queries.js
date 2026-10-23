import { BASIC_LAND, HOUSE_NAMES } from "./colors";

/* ---------------------------------------------------------
   SCRYFALL QUERIES — the search strings behind commander search,
   themes, each deck category and the mana-fixing lands.
--------------------------------------------------------- */
// Rough keyword-based archetype guess so EDHREC-inspired mode can still lean
// into a commander's theme even when it isn't one we've hand-curated.
export const ARCHETYPE_KEYWORDS = [
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

export function guessArchetype(oracleText) {
  const text = (oracleText || "").toLowerCase();
  const hit = ARCHETYPE_KEYWORDS.find(([, keywords]) => keywords.some((k) => text.includes(k)));
  return hit ? hit[0] : null;
}

export function buildNameQuery(name) {
  const trimmed = name.trim();
  // Restricted to the name field specifically — Scryfall's default bare-word
  // search also matches type lines and oracle text, which was letting
  // unrelated commanders (e.g. Atraxa) show up for an unrelated name search.
  return trimmed ? `is:commander name:"${trimmed.replace(/"/g, "")}"` : "is:commander";
}

// Client-side safety net on top of buildNameQuery: only keep results whose
// name actually contains what was typed, with names that start with it
// ranked first — the "autocomplete" feel the name search should have.
export function filterAndSortByName(cards, query) {
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

export function buildColorQuery(colorFilter, houseName, theme) {
  let colors = colorFilter;
  const houseMatch = HOUSE_NAMES[houseName.trim().toLowerCase()];
  if (houseMatch) colors = houseMatch;
  let q = colors.length ? `is:commander id=${colors.join("").toLowerCase()}` : "is:commander";
  const themeQuery = resolveThemeQuery(theme);
  if (themeQuery) q += ` ${themeQuery}`;
  return q;
}

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
export const CATEGORY_TAGS = {
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
export const WINCON_QUERY =
  '(o:"you win the game" or o:"each opponent loses" or o:"additional combat phase" ' +
  'or (o:"creatures you control get +" o:"until end of turn") ' +
  'or (t:creature pow>=6 (kw:trample or kw:flying or kw:"double strike" or kw:annihilator or o:"can\'t be blocked")) ' +
  "or (t:creature pow>=8))";
// Utility is the toolbox: tutors, counterspells, artifact/enchantment
// answers, graveyard hate and card recursion, rather than only the first.
export const UTILITY_QUERY =
  '(otag:tutor or o:"counter target spell" ' +
  'or o:"destroy target artifact" or o:"destroy target enchantment" ' +
  'or o:"exile target artifact" or o:"exile target enchantment" ' +
  "or o:\"exile target player's graveyard\" or o:\"exile all graveyards\" or o:\"exile target card from a graveyard\" " +
  'or (o:"return target" o:"from your graveyard to your hand"))';

// Reused from the archetype guesser — same keywords, phrased as search terms
// so "EDHREC-inspired" mode can pull cards matching a commander's theme.
export const ARCHETYPE_QUERIES = {
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
export const THEME_ALIASES = {
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

export function normalizeThemeKey(text) {
  const key = (text || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return THEME_ALIASES[key] || key;
}

// "Dragons" -> "Dragon", "Elves" -> "Elf", so a typed tribe matches the
// singular creature type printed on the type line.
export function singularType(word) {
  const w = word.trim();
  if (/ves$/i.test(w)) return w.slice(0, -3) + "f";
  if (/[^s]s$/i.test(w)) return w.slice(0, -1);
  return w;
}

// Free-text theme search for the color-randomizer path. If what was typed
// matches one of our curated archetypes (lifegain, tokens, aristocrats…) it
// uses that more accurate query; otherwise it falls back to a plain Scryfall
// text search so the person isn't limited to a fixed list of themes at all.
export function resolveThemeQuery(themeText) {
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
export const THEME_SUGGESTIONS = [
  "Lifegain", "Aristocrats", "Tokens", "Spellslinger", "Graveyard",
  "+1/+1 Counters", "Wheels", "Ninjas", "Enchantments", "Big Mana", "Dragons", "Voltron",
];

export function categoryQuery(cat, identity, commander, style, themeQuery) {
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

/* ---------------------------------------------------------
   MANA FIXING — multicolour decks need lands that make more than one of
   their colours, the way real Commander decks run shocks, fetches and
   friends. Lands are fetched in three tiers, best first, so an unlimited
   budget takes the premium cycles and a tight one falls through to the
   cheap tapped duals that do the same job. Each tier is one search made
   of plain rules-text matches, filtered afterwards by what the land
   actually produces.
--------------------------------------------------------- */
export const FIXING_TIERS = [
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
export function nonbasicTarget(identity, bracket) {
  // Colourless decks lean on lands like Ancient Tomb and Eldrazi Temple.
  if (identity.length === 0) return 8 + bracket.id;
  if (identity.length === 1) return 1 + (bracket.id - 1);
  // Roughly what real decks run: a two-colour deck around 10 nonbasics, a
  // five-colour deck well over 20.
  const base = { 2: 8, 3: 12, 4: 16 }[identity.length] ?? 19;
  return base + bracket.id;
}

// Keeps a land only if it really fixes for this deck: it makes at least two
// of the deck's colours, or it fetches any basic or two basic types the deck
// plays. A fetch that finds only one of the deck's types (Flooded Strand in a
// blue-red deck) is little better than that basic, so it doesn't count.
export function fixesFor(card, identity) {
  const made = (card.produced_mana || []).filter((c) => identity.includes(c));
  if (made.length >= 2) return true;
  if ((card.produced_mana || []).length) return false;
  const text = (card.oracle_text || card.card_faces?.map((f) => f.oracle_text).join("\n") || "").toLowerCase();
  if (text.includes("basic land")) return true;
  const types = identity.filter((c) => text.includes(BASIC_LAND[c].toLowerCase()));
  return types.length >= Math.min(2, identity.length);
}

/* Lands that sacrifice themselves to find another: the true fetches,
   Prismatic Vista, Evolving Wilds and the like. Fetches are among the most
   played lands, so left alone they crowded the dual lands out of every
   mana base.

   How many real decks run, from EDHREC's average decks (Oct 2026):
   budget lists run none or two cheap ones (Evolving Wilds, Terramorphic
   Expanse), mid-price two- and three-colour lists run nought to three, and
   only expensive or optimized lists run seven to ten, alongside shocks and
   original duals. So the allowance grows with the bracket and the number of
   land slots, and a tight budget keeps it at two. */
// Below this budget a deck sticks to a couple of cheap fetches.
const FETCH_BUDGET_THRESHOLD = 200;

export function fetchLandLimit(identity, bracket, budget = null) {
  if (identity.length <= 1) return 1;
  const slots = nonbasicTarget(identity, bracket);
  const byBracket = { 1: 1, 2: 2, 3: 3, 4: Math.round(slots * 0.3), 5: Math.round(slots * 0.4) }[bracket.id] ?? 2;
  return budget != null && budget > 0 && budget < FETCH_BUDGET_THRESHOLD ? Math.min(byBracket, 2) : byBracket;
}

export function isFetchLand(card) {
  const text = (card.oracleText || card.oracle_text || "").toLowerCase();
  return text.includes("sacrifice") && /search your library for an? [^.]*(land|plains|island|swamp|mountain|forest)/.test(text);
}

// Keeps the first `limit` fetches in a list of lands, in order.
export function limitFetchLands(lands, limit) {
  let left = limit;
  return lands.filter((land) => !isFetchLand(land) || left-- > 0);
}
