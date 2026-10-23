import { guessArchetype, FIXING_TIERS, fixesFor } from "./queries";

export function mapScryfallCardToCommander(card) {
  const faceImages = card.image_uris || card.card_faces?.[0]?.image_uris || null;
  const oracleText = card.oracle_text || card.card_faces?.map((f) => f.oracle_text).filter(Boolean).join("\n\n") || null;
  const typeLine = card.card_faces?.[0]?.type_line || card.type_line || "";
  return {
    name: card.name,
    identity: card.color_identity || [],
    archetype: guessArchetype(oracleText),
    blurb: typeLine || "Legendary creature",
    gameChanger: Boolean(card.game_changer),
    imageSmall: faceImages?.small || null,
    imageLarge: faceImages?.large || faceImages?.png || null,
    priceUsd: card.prices?.usd || card.prices?.usd_foil || null,
    priceEur: card.prices?.eur || card.prices?.eur_foil || null,
    scryfallUri: card.scryfall_uri || null,
    oracleText,
  };
}

export async function scryfallSearchCommanders(query) {
  const res = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&order=edhrec&unique=cards`);
  if (res.status === 404) return { cards: [], total: 0 };
  if (!res.ok) throw new Error(`Scryfall responded ${res.status}`);
  const json = await res.json();
  return { cards: (json.data || []).slice(0, 20).map(mapScryfallCardToCommander), total: json.total_cards || 0 };
}

export async function scryfallRandomCommander(query) {
  const res = await fetch(`https://api.scryfall.com/cards/random?q=${encodeURIComponent(query)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Scryfall responded ${res.status}`);
  const card = await res.json();
  return mapScryfallCardToCommander(card);
}

// With unique=cards Scryfall returns one printing per card, and by default
// that can be a promo, Secret Lair or digital-only printing with no price at
// all. Those cards then showed "—" and were budgeted at a flat guess. Asking
// for the cheapest printing that has a price in the chosen currency fixes
// both the displayed price and the budget maths.
export function preferPricedPrinting(priceSource) {
  if (priceSource === "usd") return " prefer:usd-low";
  if (priceSource === "eur") return " prefer:eur-low";
  return "";
}

export async function scryfallSearchCards(query, priceSource = "none") {
  const q = query + preferPricedPrinting(priceSource);
  const res = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&order=edhrec&unique=cards`);
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Scryfall responded ${res.status}`);
  const json = await res.json();
  return json.data || [];
}

export function mapScryfallCard(card) {
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
    // For the mana curve and card-type breakdown on the result screen.
    cmc: typeof card.cmc === "number" ? card.cmc : null,
    typeLine: card.card_faces?.[0]?.type_line || card.type_line || "",
    gameChanger: Boolean(card.game_changer),
  };
}

export async function fetchFixingLands(identity, priceSource) {
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

// Scryfall's full card data for each named card, cheapest priced printing
// first, a few dozen names per search so a whole deck's stragglers cost one
// or two requests.
export async function fetchCardsByName(names, priceSource = "none") {
  const unique = [...new Set(names)];
  const cards = [];
  for (let i = 0; i < unique.length; i += 20) {
    const chunk = unique.slice(i, i + 20);
    const query = `(${chunk.map((n) => `!"${n.replace(/"/g, "")}"`).join(" or ")})`;
    cards.push(...(await scryfallSearchCards(query, priceSource)));
  }
  return cards;
}

// Looks up the cheapest priced printing of each named card.
export async function fetchCheapestPrintings(names, priceSource) {
  const result = {};
  (await fetchCardsByName(names, priceSource)).map(mapScryfallCard).forEach((c) => { result[c.name.toLowerCase()] = c; });
  return result;
}

// Cards matching typed text that a deck with this colour identity can run,
// most played first, for adding a card by hand. Returns Scryfall's full data.
export async function searchAddableCards(text, identity) {
  const words = text.trim().replace(/"/g, "");
  if (words.length < 2) return [];
  const cards = await scryfallSearchCards(`f:commander id<=${identity.join("").toLowerCase() || "c"} name:"${words}"`);
  return cards.slice(0, 12);
}

/* ---------------------------------------------------------
   SCRYFALL — live card images + prices
   Uses the public /cards/collection endpoint (no API key
   required, CORS-enabled). Scryfall itself aggregates the
   USD price from TCGplayer and the EUR price from Cardmarket,
   so this is how we surface "TCGplayer" / "Cardmarket" pricing
   without scraping either retailer directly (which isn't
   something a client-side app can or should do).
--------------------------------------------------------- */
export async function fetchScryfallData(names) {
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
      result[card.name.toLowerCase()] = mapScryfallCard(card);
    });
  }
  return result;
}

export function scryfallCardPageUrl(name) {
  return `https://scryfall.com/search?q=${encodeURIComponent(`!"${name}"`)}`;
}
