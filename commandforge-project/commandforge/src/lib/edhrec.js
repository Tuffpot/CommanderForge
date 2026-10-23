import { functionUrl } from "./shareDeck";

// Cards in fewer of a commander's decks than this are too niche to steer a
// build: they're often one player's pet card.
export const MIN_SHARE = 0.08;

/* What real decks with this commander run, from EDHREC through the site's
   edhrec function: a list of { name, share, synergy }, most played first,
   where share is the fraction of the commander's decks that run the card.
   Returns null when EDHREC has nothing or can't be reached, so the builder
   can fall back to its own picks. */
export async function fetchEdhrecCards(commanderName) {
  try {
    const res = await fetch(`${functionUrl("edhrec")}?commander=${encodeURIComponent(commanderName)}`);
    if (!res.ok) return null;
    const json = await res.json();
    const cards = Array.isArray(json?.cards) ? json.cards.filter((c) => typeof c?.name === "string") : [];
    return cards.length ? cards : null;
  } catch {
    return null;
  }
}

/* Lower-case name to rank (0 is the most played) for the cards played in
   enough of the commander's decks to count. */
export function edhrecRanks(cards) {
  const ranks = new Map();
  (cards || [])
    .filter((c) => c.share == null || c.share >= MIN_SHARE)
    .forEach((c) => {
      const key = c.name.toLowerCase();
      if (!ranks.has(key)) ranks.set(key, ranks.size);
    });
  return ranks;
}

// Puts the cards real decks run first, most played first, and leaves the
// rest in their order after them.
export function edhrecFirst(list, ranks) {
  if (!ranks?.size) return list;
  const rank = (c) => ranks.get(c.name.toLowerCase());
  return [
    ...list.filter((c) => rank(c) != null).sort((a, b) => rank(a) - rank(b)),
    ...list.filter((c) => rank(c) == null),
  ];
}
