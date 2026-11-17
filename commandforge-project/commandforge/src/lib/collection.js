import { ARCHETYPE_KEYWORDS, normalizeThemeKey, singularType } from "./queries";

/* ---------------------------------------------------------
   COLLECTION — reading someone's card collection (a ManaBox CSV
   export, or a pasted "1 Sol Ring" list), looking the cards up on
   Scryfall, and sorting them into the same deck roles the normal
   builder fills from Scryfall searches.
--------------------------------------------------------- */

// Splits CSV text into rows of fields, handling quoted fields with commas,
// doubled quotes and line breaks inside them.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim()));
}

// A CSV export has a header row naming a "Name" column. ManaBox calls the
// count "Quantity"; Moxfield and others use "Count" or "Qty".
function looksLikeCsv(text) {
  const firstLine = text.trimStart().split(/\r?\n/, 1)[0].toLowerCase();
  return firstLine.includes(",") && /(^|,)"?name"?(,|$)/.test(firstLine);
}

export function parseCsvCollection(text) {
  const [header, ...rows] = parseCsv(text.replace(/^\uFEFF/, ""));
  const cols = header.map((h) => h.trim().toLowerCase());
  const nameCol = cols.indexOf("name");
  const qtyCol = cols.findIndex((c) => ["quantity", "count", "qty"].includes(c));
  const idCol = cols.indexOf("scryfall id");
  return rows
    .map((r) => ({
      name: (r[nameCol] || "").trim(),
      qty: qtyCol >= 0 ? parseInt(r[qtyCol], 10) || 1 : 1,
      scryfallId: idCol >= 0 ? (r[idCol] || "").trim() || null : null,
    }))
    .filter((e) => e.name);
}

// Section headings deck sites put in their exports.
const LIST_HEADINGS = /^(commander|commanders|deck|main ?board|side ?board|maybe ?board|companion|sideboard|lands?|creatures?|spells?)\s*:?\s*(\(\d+\))?$/i;

// One card per line: "1 Sol Ring", "2x Island", "Sol Ring", and the
// set/collector-number and foil markers that Moxfield, Archidekt and
// ManaBox's own text export add after the name.
export function parseCardList(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+(\/\/|#)\s.*$/, "").trim())
    .filter((line) => line && !line.startsWith("//") && !line.startsWith("#") && !LIST_HEADINGS.test(line))
    .map((line) => {
      const m = line.match(/^(\d+)\s*x?\s+(.+)$/i);
      const qty = m ? parseInt(m[1], 10) : 1;
      const name = (m ? m[2] : line)
        .replace(/\s+\*[A-Z]\*$/i, "")
        .replace(/\s+\([A-Z0-9]{2,6}\)(\s+\S+)?$/i, "")
        .replace(/\s+\[[A-Z0-9]{2,6}\](\s+\S+)?$/i, "")
        .trim();
      return { name, qty, scryfallId: null };
    })
    .filter((e) => e.name);
}

export function parseCollectionText(text) {
  return looksLikeCsv(text) ? parseCsvCollection(text) : parseCardList(text);
}

// Adds up entries for the same card (several printings, foils, or the same
// card on two lines) into one entry per name.
export function mergeEntries(...lists) {
  const byName = new Map();
  lists.flat().forEach(({ name, qty }) => {
    const key = name.toLowerCase();
    const prev = byName.get(key);
    byName.set(key, { name: prev?.name || name, qty: (prev?.qty || 0) + (qty || 1) });
  });
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// Sets how many copies of one card the collection holds, adding it if it
// isn't there yet. Zero (or less) takes the card out altogether.
export function setEntryQty(entries, name, qty) {
  const key = name.toLowerCase();
  const n = Math.max(0, Math.floor(qty) || 0);
  const others = entries.filter((e) => e.name.toLowerCase() !== key);
  if (!n) return others;
  const prev = entries.find((e) => e.name.toLowerCase() === key);
  if (prev) return entries.map((e) => (e === prev ? { ...e, qty: n } : e));
  return mergeEntries(others, [{ name, qty: n }]);
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Looks the collection up on Scryfall, 75 cards per request (the most the
// collection endpoint takes), using the exact printing's Scryfall ID when
// the export has one. Returns each card's full Scryfall data keyed by its
// lower-cased name, the entries renamed to Scryfall's spelling (so "Fire /
// Ice" and a front-face-only name both land on the real card), and the
// names Scryfall didn't recognise.
export async function fetchCollectionCards(entries, onProgress) {
  const cards = {};
  const resolved = [];
  const notFound = [];
  for (let i = 0; i < entries.length; i += 75) {
    if (i > 0) await pause(100); // Scryfall asks for a short gap between requests
    const chunk = entries.slice(i, i + 75);
    const identifiers = chunk.map((e) => (e.scryfallId ? { id: e.scryfallId } : { name: e.name }));
    const res = await fetch("https://api.scryfall.com/cards/collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifiers }),
    });
    if (!res.ok) throw new Error(`Scryfall responded ${res.status}`);
    const json = await res.json();
    const data = json.data || [];
    const missing = new Set((json.not_found || []).map((nf) => (nf.id || nf.name || "").toLowerCase()));
    // Scryfall returns found cards in request order, skipping the ones it
    // couldn't find, so walk both lists together.
    let d = 0;
    chunk.forEach((entry) => {
      const key = (entry.scryfallId || entry.name).toLowerCase();
      if (missing.has(key)) {
        notFound.push(entry.name);
        return;
      }
      const card = data[d++];
      if (!card) {
        notFound.push(entry.name);
        return;
      }
      cards[card.name.toLowerCase()] = card;
      resolved.push({ name: card.name, qty: entry.qty });
    });
    onProgress?.(Math.min(entries.length, i + 75), entries.length);
  }
  return { cards, entries: mergeEntries(resolved), notFound };
}

export function frontType(card) {
  return card.card_faces?.[0]?.type_line || card.type_line || "";
}

export function fullText(card) {
  return (card.oracle_text || card.card_faces?.map((f) => f.oracle_text).filter(Boolean).join("\n") || "").toLowerCase();
}

export function isLand(card) {
  return /\bLand\b/.test(frontType(card));
}

export function isBasicLand(card) {
  return /\bBasic\b/.test(frontType(card)) && isLand(card);
}

export function legalInCommander(card) {
  return card.legalities?.commander === "legal";
}

// The same cards Scryfall's is:commander matches: legendary creatures, and
// cards that say they can be your commander.
export function canBeCommander(card) {
  if (!legalInCommander(card)) return false;
  const type = frontType(card);
  if (/\bLegendary\b/.test(type) && /\bCreature\b/.test(type)) return true;
  return fullText(card).includes("can be your commander");
}

export function fitsIdentity(card, identity) {
  return (card.color_identity || []).every((c) => identity.includes(c));
}

const popularity = (card) => card.edhrec_rank ?? Number.MAX_SAFE_INTEGER;
export function byPopularity(a, b) {
  return popularity(a) - popularity(b);
}

/* Local versions of the category searches in queries.js. Scryfall's
   otag: function tags can't be checked against a collection without a
   search per card, so these read the rules text instead. They are
   looser than the tags, which suits a collection: a card that might do
   the job beats a basic land. */
const has = (text, ...phrases) => phrases.some((p) => text.includes(p));

export const CATEGORY_TESTS = {
  ramp: (card, text) =>
    (!isLand(card) && (card.produced_mana || []).length > 0) ||
    /\badd \{/.test(text) ||
    has(text, "search your library for a basic land", "search your library for up to two basic land",
      "search your library for a land", "put a land card from your hand onto the battlefield",
      "create a treasure", "treasure token", "additional land", "lands you control untap"),
  draw: (card, text) =>
    /\bdraws? (a|one|two|three|four|five|x|that many|cards?)\b/.test(text) ||
    has(text, "investigate", "connive", "draw cards equal") ||
    (text.includes("exile the top") && has(text, "you may play", "you may cast")),
  removal: (card, text) =>
    has(text, "destroy target", "destroy all", "destroy each", "exile all", "exile each",
      "damage to target creature", "damage to any target", "damage to each creature", "damage to each opponent",
      "fights target", "fights up to one", "counter target", "return target creature to its owner",
      "return target nonland permanent", "each opponent sacrifices", "target player sacrifices", "sacrifices a creature") ||
    /exile (up to (one|two) )?target (creature|nonland|permanent|artifact|enchantment|planeswalker)/.test(text) ||
    /target creature (an opponent controls )?gets -\d/.test(text),
  protection: (card, text) =>
    has(text, "hexproof", "indestructible", "shroud", "phase out", "phases out", "protection from", "regenerate",
      "can't be countered", "ward {"),
  wincon: (card, text) => {
    const power = parseInt(card.power ?? card.card_faces?.[0]?.power, 10);
    const creature = /\bCreature\b/.test(frontType(card));
    const evasive = has(text, "trample", "flying", "double strike", "annihilator", "can't be blocked");
    return has(text, "you win the game", "each opponent loses", "additional combat phase") ||
      (text.includes("creatures you control get +") && text.includes("until end of turn")) ||
      (creature && power >= 6 && evasive) ||
      (creature && power >= 8);
  },
  utility: (card, text) =>
    has(text, "search your library for a card", "counter target spell", "destroy target artifact",
      "destroy target enchantment", "exile target artifact", "exile target enchantment",
      "exile target player's graveyard", "exile all graveyards", "exile target card from a graveyard") ||
    (text.includes("return target") && text.includes("from your graveyard to your hand")),
};

// What the synergy slot looks for: a typed theme, else (in "inspired"
// mode) the commander's guessed archetype. Returns null when synergy should
// take the best of anything left, like the normal builder's plain search.
export function synergyTest(commander, style, theme) {
  const themeKey = theme ? normalizeThemeKey(theme) : null;
  const archetype = themeKey || (style === "edhrec" ? commander.archetype : null);
  if (!archetype) return null;
  const keywords = ARCHETYPE_KEYWORDS.find(([k]) => k === archetype)?.[1];
  if (keywords) return (card, text) => has(text, ...keywords);
  if (archetype === "voltron") {
    return (card, text) => /\b(Equipment|Aura)\b/.test(frontType(card)) || has(text, "equipped creature", "enchanted creature");
  }
  // A free-typed theme such as "dragons": rules text or type line.
  const phrase = theme.trim().toLowerCase();
  const tribe = singularType(theme.trim()).toLowerCase();
  return (card, text) => text.includes(phrase) || frontType(card).toLowerCase().includes(tribe);
}

// Every commander in the collection, most played first.
export function ownedCommanders(cards) {
  return Object.values(cards).filter(canBeCommander).sort(byPopularity);
}

// How many of the collection's cards a commander could actually play.
export function playableCount(commander, cards) {
  const identity = commander.color_identity || commander.identity || [];
  const name = commander.name.toLowerCase();
  return Object.values(cards).filter(
    (c) => c.name.toLowerCase() !== name && legalInCommander(c) && !isBasicLand(c) && fitsIdentity(c, identity)
  ).length;
}
