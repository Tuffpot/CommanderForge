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
];

function guessArchetype(oracleText) {
  const text = (oracleText || "").toLowerCase();
  const hit = ARCHETYPE_KEYWORDS.find(([, keywords]) => keywords.some((k) => text.includes(k)));
  return hit ? hit[0] : null;
}

function mapScryfallCardToCommander(card) {
  const faceImages = card.image_uris || card.card_faces?.[0]?.image_uris || null;
  const oracleText = card.oracle_text || card.card_faces?.map((f) => f.oracle_text).filter(Boolean).join("\n\n") || null;
  const typeLine = (card.card_faces?.[0]?.type_line || card.type_line || "").replace(/^Legendary /, "");
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
  return trimmed ? `is:commander (${trimmed})` : "is:commander";
}

function buildColorQuery(colorFilter, houseName) {
  let colors = colorFilter;
  const houseMatch = HOUSE_NAMES[houseName.trim().toLowerCase()];
  if (houseMatch) colors = houseMatch;
  return colors.length ? `is:commander id=${colors.join("").toLowerCase()}` : "is:commander";
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
const WINCON_QUERY = "(t:creature pow>=6 or otag:boardwipe)";
const UTILITY_QUERY = '(o:"destroy target artifact" or o:"destroy target enchantment" or o:"exile target artifact" or o:"exile target enchantment")';

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
};

function categoryQuery(cat, identity, commander, style) {
  const idPart = `id<=${identity.join("").toLowerCase() || "c"}`;
  const base = `f:commander ${idPart} -t:land`;
  if (cat === "wincon") return `${base} ${WINCON_QUERY}`;
  if (cat === "utility") return `${base} ${UTILITY_QUERY}`;
  if (cat === "synergy") {
    const archQuery = style === "edhrec" && commander.archetype && ARCHETYPE_QUERIES[commander.archetype];
    return archQuery ? `${base} ${archQuery}` : base;
  }
  return `${base} ${CATEGORY_TAGS[cat]}`;
}

async function scryfallSearchCards(query) {
  const res = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&order=edhrec&unique=cards`);
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

const BASIC_LAND = { W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest" };

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
};

const SINGLE_COLOR_NAMES = { W: "Mono-White", U: "Mono-Blue", B: "Mono-Black", R: "Mono-Red", G: "Mono-Green" };

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

// Picks `target` cards from an already-ordered list. Under an active budget it
// greedily keeps within the shared remaining budget, only reaching past it if
// there aren't enough affordable cards left to fill the required slot count.
function pickWithinBudget(ordered, target, cardData, priceSource, budgetState) {
  if (!budgetState.active) return ordered.slice(0, target);

  const chosen = [];
  for (const card of ordered) {
    if (chosen.length >= target) break;
    const price = priceOf(card.name, cardData, priceSource) ?? UNKNOWN_PRICE_ESTIMATE;
    if (price <= budgetState.remaining) {
      chosen.push(card);
      budgetState.remaining -= price;
    }
  }
  if (chosen.length < target) {
    for (const card of ordered) {
      if (chosen.length >= target) break;
      if (chosen.includes(card)) continue;
      chosen.push(card);
      budgetState.remaining -= priceOf(card.name, cardData, priceSource) ?? UNKNOWN_PRICE_ESTIMATE;
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

async function buildDeck(commander, style, bracket, opts = {}) {
  const { budget = null, priceSource = "none" } = opts;
  const identity = commander.identity;
  const recipe = bracket.recipe;
  const usedNames = new Set([commander.name.toLowerCase()]);
  const picks = { ramp: [], draw: [], removal: [], protection: [], synergy: [], wincon: [], utility: [] };
  const cardData = {};
  let nonlandTotal = 0;

  const catKeys = Object.keys(recipe);
  const [categoryResults, nonbasicRaw] = await Promise.all([
    Promise.all(catKeys.map((cat) => scryfallSearchCards(categoryQuery(cat, identity, commander, style)).catch(() => []))),
    scryfallSearchCards(`f:commander id<=${identity.join("").toLowerCase() || "c"} t:land -t:basic`).catch(() => []),
  ]);

  // If every single fetch came back empty, this is almost certainly a
  // network failure rather than a genuinely cardless color combo — surface
  // that clearly instead of silently handing back a near-empty deck.
  const totalFetched = categoryResults.reduce((a, r) => a + r.length, 0) + nonbasicRaw.length;
  if (totalFetched === 0) throw new Error("Scryfall returned no data — likely a network issue");

  const categoryCards = {};
  catKeys.forEach((cat, i) => {
    categoryCards[cat] = categoryResults[i].map(mapScryfallCard);
    categoryCards[cat].forEach((c) => { cardData[c.name.toLowerCase()] = c; });
  });
  const nonbasicPool = nonbasicRaw.map(mapScryfallCard);
  nonbasicPool.forEach((c) => { cardData[c.name.toLowerCase()] = c; });

  const budgetActive = budget != null && budget > 0 && priceSource !== "none";
  const budgetState = { active: budgetActive, remaining: budgetActive ? budget : Infinity };
  const preferExpensive = !budgetActive;

  catKeys.forEach((cat) => {
    const rawCandidates = categoryCards[cat].filter((c) => !usedNames.has(c.name.toLowerCase()));
    const { staples, rest } = pullStaples(rawCandidates, AUTO_INCLUDES[cat] || []);

    const orderedRest = orderCandidates(rest, cardData, priceSource, preferExpensive);
    const remainingTarget = Math.max(0, recipe[cat] - staples.length);
    const filled = pickWithinBudget(orderedRest, remainingTarget, cardData, priceSource, budgetState);

    if (budgetState.active) {
      staples.forEach((c) => {
        budgetState.remaining -= priceOf(c.name, cardData, priceSource) ?? UNKNOWN_PRICE_ESTIMATE;
      });
    }

    const take = [...staples, ...filled];
    take.forEach((c) => usedNames.add(c.name.toLowerCase()));
    picks[cat] = take;
    nonlandTotal += take.length;
  });

  const deficit = NONLAND_TARGET - nonlandTotal;
  const landTarget = LAND_TARGET + deficit;

  const nonbasicRawFiltered = nonbasicPool.filter((l) => !usedNames.has(l.name.toLowerCase()));
  const { staples: landStaples, rest: nonbasicRest } =
    identity.length > 1 ? pullStaples(nonbasicRawFiltered, ["Command Tower"]) : { staples: [], rest: nonbasicRawFiltered };

  const nonbasicCandidates = orderCandidates(nonbasicRest, cardData, priceSource, preferExpensive);
  const nonbasicBase = identity.length > 1 ? 4 : 1;
  const nonbasicRestTarget = Math.max(0, Math.min(nonbasicCandidates.length, nonbasicBase + (bracket.id - 1)) - landStaples.length);
  const nonbasicsFilled = pickWithinBudget(nonbasicCandidates, nonbasicRestTarget, cardData, priceSource, budgetState);

  if (budgetState.active) {
    landStaples.forEach((c) => {
      budgetState.remaining -= priceOf(c.name, cardData, priceSource) ?? UNKNOWN_PRICE_ESTIMATE;
    });
  }

  const nonbasicsChosen = [...landStaples, ...nonbasicsFilled];
  nonbasicsChosen.forEach((c) => usedNames.add(c.name.toLowerCase()));
  const nonbasics = nonbasicsChosen.map((l) => ({ name: l.name, qty: 1 }));

  const basicsNeeded = landTarget - nonbasics.length;
  const basics = [];
  identity.forEach((c, i) => {
    const share = Math.floor(basicsNeeded / identity.length) + (i < basicsNeeded % identity.length ? 1 : 0);
    if (share > 0) basics.push({ name: BASIC_LAND[c], qty: share });
  });

  try {
    const basicData = await fetchScryfallData([...new Set(basics.map((b) => b.name))]);
    Object.assign(cardData, basicData);
  } catch {
    // basics are near-free either way; missing price data here is harmless
  }

  return { picks, nonbasics, basics, budgetActive, budgetRemaining: budgetState.remaining, cardData };
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
    const handle = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const { cards } = await scryfallSearchCommanders(buildNameQuery(search));
        setSearchResults(cards);
        const exact = cards.find((c) => c.name.toLowerCase() === search.trim().toLowerCase());
        if (exact) setSelectedCommander(exact);
      } catch {
        setSearchError(true);
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, selectedCommander]);

  // Live match count for the color-randomizer path.
  useEffect(() => {
    setColorMatchError(false);
    const handle = setTimeout(async () => {
      setColorMatchLoading(true);
      try {
        const { total } = await scryfallSearchCommanders(buildColorQuery(colorFilter, houseName));
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
  }, [colorFilter, houseName]);

  function toggleColor(c) {
    setColorFilter((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  async function resolveAndForgeFromSearch() {
    const query = search.trim();
    if (!query || isForging) return;
    setSearchLoading(true);
    try {
      const { cards } = await scryfallSearchCommanders(buildNameQuery(query));
      setSearchResults(cards);
      const exact = cards.find((c) => c.name.toLowerCase() === query.toLowerCase());
      const resolved = selectedCommander || exact || cards[0];
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
    [...deck.nonbasics, ...deck.basics].forEach((l) => {
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
  async function forgeWith(commander, activeBracket) {
    setIsForging(true);
    setCardDataStatus("loading");
    try {
      const built = await buildDeck(commander, inspired ? "edhrec" : "random", activeBracket, {
        budget: parsedBudget,
        priceSource,
      });
      setDeck({
        commander,
        style: inspired ? "edhrec" : "random",
        bracket: activeBracket,
        budgetTarget: parsedBudget,
        picks: built.picks,
        nonbasics: built.nonbasics,
        basics: built.basics,
      });

      // The commander's own image/price/oracle text already came back with
      // the search or randomize call, so fold it in directly.
      const commanderEntry = {
        name: commander.name,
        imageSmall: commander.imageSmall,
        imageLarge: commander.imageLarge,
        priceUsd: commander.priceUsd,
        priceEur: commander.priceEur,
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
      const commander = await scryfallRandomCommander(buildColorQuery(colorFilter, houseName));
      if (!commander) {
        setRandomizeError(true);
        setIsForging(false);
        return;
      }
      setSelectedCommander(commander);
      await forgeWith(commander, bracket);
    } catch {
      setRandomizeError(true);
      setIsForging(false);
    }
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
      card_data: priceSource !== "none" ? cardData : {},
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
    await supabase.from("decks").delete().eq("id", id);
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
                        ? "The builder will favor the cheapest eligible card in each slot to try to stay under this total."
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
                  {["W", "U", "B", "R", "G"].map((c) => (
                    <button
                      key={c}
                      onClick={() => toggleColor(c)}
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

                <div className="rounded-xl bg-black/30 border border-white/10 px-4 py-3 mb-4">
                  <p className="text-[11px] text-white/40 uppercase tracking-wide font-semibold mb-1">This will also use</p>
                  <p className="text-xs text-white/70 leading-relaxed">
                    Bracket: <span className="text-white font-semibold">{bracket ? `${bracket.id} · ${bracket.name}` : "none selected yet"}</span>
                    {priceSource !== "none" && (
                      <>
                        {" · "}Budget: <span className="text-white font-semibold">{parsedBudget ? formatPrice(parsedBudget, priceSource) : "no limit"}</span>
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
