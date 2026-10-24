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

// A link that opens the builder with a commander already picked:
// https://brewhall.co.uk/?commander=Atraxa%2C%20Praetors%27%20Voice. Handy for
// replying to "help me build X" posts.
export function commanderUrl(name) {
  return `${SITE_URL}/?commander=${encodeURIComponent(name)}`;
}

// The commander named in a page address, or null when there isn't one.
export function commanderFromUrl(href) {
  try {
    const name = new URL(href).searchParams.get("commander")?.trim();
    return name && name.length <= 150 ? name : null;
  } catch {
    return null;
  }
}

// Hands a link to the phone's share sheet (Messages, Discord, WhatsApp…)
// where there is one, and copies it everywhere else. Says which happened:
// "sent", "copied", "cancelled" or "failed".
export async function sendLink({ title, url }, nav = typeof navigator !== "undefined" ? navigator : null) {
  if (nav?.share) {
    try {
      await nav.share({ title, url });
      return "sent";
    } catch (e) {
      if (e?.name === "AbortError") return "cancelled";
    }
  }
  try {
    await nav.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
