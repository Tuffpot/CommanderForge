// Passes a decklist to Commander Spellbook's combo finder and returns its
// answer. The app calls this rather than Spellbook directly because browsers
// only let a page read another site's reply if that site allows it, and
// Spellbook doesn't promise to.
const SPELLBOOK = "https://backend.commanderspellbook.com/find-my-combos/";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return new Response("POST a decklist", { status: 405, headers: CORS });

  let deck;
  try {
    deck = await req.json();
  } catch {
    return new Response("Expected JSON", { status: 400, headers: CORS });
  }
  // A Commander deck is 100 cards; anything far bigger isn't one.
  const main = Array.isArray(deck?.main) ? deck.main.slice(0, 120) : [];
  const commanders = Array.isArray(deck?.commanders) ? deck.commanders.slice(0, 2) : [];
  const clean = (list) => list.filter((c) => typeof c?.card === "string").map((c) => ({ card: c.card.slice(0, 200), quantity: 1 }));

  try {
    const res = await fetch(SPELLBOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "Brewhall (brewhall.co.uk)" },
      body: JSON.stringify({ commanders: clean(commanders), main: clean(main) }),
      signal: AbortSignal.timeout(9000),
    });
    return new Response(await res.text(), {
      status: res.status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch {
    return new Response("Commander Spellbook didn't answer", { status: 502, headers: CORS });
  }
};
