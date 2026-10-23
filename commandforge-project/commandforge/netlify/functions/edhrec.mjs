// Looks a commander up on EDHREC and returns the cards real decks with it
// run, and in what share of those decks. The app calls this rather than
// EDHREC directly because browsers only let a page read another site's
// reply if that site allows it. Replies are cached for a day, since EDHREC's
// numbers move slowly and there's no need to ask twice.
const EDHREC = "https://json.edhrec.com/pages/commanders/";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

// EDHREC's page names: lower case, accents and punctuation dropped, words
// joined with hyphens ("Atraxa, Praetors' Voice" is atraxa-praetors-voice).
// A double-faced commander goes by its front face.
export function edhrecSlug(name) {
  return name
    .split(" // ")[0]
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’,.!?:"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Every card on the page once, with the share of the commander's decks that
// run it, most played first.
export function cardsFrom(json) {
  const lists = json?.container?.json_dict?.cardlists;
  if (!Array.isArray(lists)) return [];
  const decks = json.num_decks_avg || json.num_decks || null;
  const byName = new Map();
  lists.forEach((list) => {
    (list.cardviews || []).forEach((card) => {
      if (typeof card?.name !== "string") return;
      const included = card.inclusion ?? card.num_decks;
      const out = card.potential_decks || decks;
      const share = included != null && out ? Math.min(1, included / out) : null;
      const prev = byName.get(card.name);
      if (!prev || (share ?? 0) > (prev.share ?? 0)) {
        byName.set(card.name, { name: card.name, share, synergy: typeof card.synergy === "number" ? card.synergy : null });
      }
    });
  });
  return [...byName.values()].sort((a, b) => (b.share ?? 0) - (a.share ?? 0));
}

async function fetchPage(slug) {
  const res = await fetch(`${EDHREC}${slug}.json`, {
    headers: { "User-Agent": "Brewhall (brewhall.co.uk)" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  return res.json();
}

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const name = new URL(req.url).searchParams.get("commander");
  if (!name || name.length > 200) return new Response("Name a commander", { status: 400, headers: CORS });

  try {
    let json = await fetchPage(edhrecSlug(name));
    // Some names redirect to the page EDHREC actually uses.
    if (json?.redirect) json = await fetchPage(json.redirect.split("/").filter(Boolean).pop());
    const cards = cardsFrom(json);
    if (!cards.length) return new Response("EDHREC has no page for that commander", { status: 404, headers: CORS });
    return new Response(JSON.stringify({ decks: json.num_decks_avg || null, cards }), {
      headers: {
        ...CORS,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
        "Netlify-CDN-Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
      },
    });
  } catch {
    return new Response("EDHREC didn't answer", { status: 502, headers: CORS });
  }
};
