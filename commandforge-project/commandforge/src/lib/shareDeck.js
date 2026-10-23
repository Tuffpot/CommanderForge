// Read-only links to a saved deck: https://brewhall.co.uk/?deck=<id>.
// The site address is fixed so links made in the phone apps (which run
// from a local address) still open on the web.
export const SITE_URL = "https://brewhall.co.uk";

/* Where one of the site's own functions (netlify/functions) answers. The
   phone apps run from a local address, so they use the live site's. */
export function functionUrl(name) {
  const onSite = typeof window !== "undefined" && /^https?:$/.test(window.location.protocol) && window.location.hostname !== "localhost";
  return `${onSite ? "" : SITE_URL}/.netlify/functions/${name}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function shareUrl(deckId) {
  return `${SITE_URL}/?deck=${deckId}`;
}

// The shared deck's id from a page address, or null when there isn't a
// well-formed one.
export function sharedDeckIdFromUrl(href) {
  try {
    const id = new URL(href).searchParams.get("deck");
    return id && UUID.test(id) ? id.toLowerCase() : null;
  } catch {
    return null;
  }
}

// A decks row (or a get_shared_deck result) in the shape the app uses.
export function mapDeckRow(row) {
  return {
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
    shared: Boolean(row.shared),
  };
}
