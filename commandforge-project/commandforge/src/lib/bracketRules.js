import { scryfallSearchCards } from "./scryfall";
import { SITE_URL } from "./shareDeck";

/* The official Commander bracket rules (Wizards, last updated February 2026):

   Bracket          Game Changers  Mass land denial  Extra turns          Two-card combos
   1 Exhibition     none           none              none                 none
   2 Core           none           none              a few, not chained   none
   3 Upgraded       up to 3        none              a few, not chained   none early on
   4 Optimized      any            any               any                  any
   5 cEDH           any            any               any                  any

   Game Changers come live from Scryfall (is:gamechanger), so the list stays
   current without a code change. "A few extra turns" is taken as one, which
   can't chain. Brewhall can't tell an early combo from a late one, so
   bracket 3 leaves out two-card combos altogether. */
export function bracketLimits(bracketId) {
  if (bracketId >= 4) return { gameChangers: Infinity, extraTurns: Infinity, massLandDenial: true, twoCardCombos: true };
  return {
    gameChangers: bracketId === 3 ? 3 : 0,
    extraTurns: bracketId === 1 ? 0 : 1,
    massLandDenial: false,
    twoCardCombos: false,
  };
}

// Wizards defines mass land denial as cards that regularly destroy, exile,
// bounce, keep tapped or change the mana of four or more lands per player.
// There's no searchable tag for it, so these are the well-known ones.
export const MASS_LAND_DENIAL = new Set([
  "Apocalypse", "Armageddon", "Back to Basics", "Bend or Break", "Blood Moon", "Boom // Bust", "Burning of Xinye",
  "Cataclysm", "Catastrophe", "Contamination", "Decree of Annihilation", "Desolation Angel", "Destructive Force",
  "Devastation", "Embargo", "Epicenter", "Global Ruin", "Hokori, Dust Drinker", "Impending Disaster", "Jokulhaups",
  "Keldon Firebombers", "Magus of the Moon", "Mana Vortex", "Myojin of Infinite Rage", "Natural Balance",
  "Obliterate", "Overburden", "Ravages of War", "Rising Waters", "Ritual of Subdual", "Ruination", "Static Orb",
  "Stasis", "Sunder", "Tangle Wire", "Tectonic Break", "Thoughts of Ruin", "Upheaval", "Wildfire", "Winter Moon",
  "Winter Orb",
].map((n) => n.toLowerCase()));

export function isExtraTurn(card) {
  return /takes? an extra turn/i.test(card?.oracleText || card?.oracle_text || "");
}

// Every Game Changer in the commander's colours, as lower-case names.
export async function fetchGameChangers(identity) {
  const cards = await scryfallSearchCards(`is:gamechanger f:commander id<=${identity.join("").toLowerCase() || "c"}`);
  return new Set(cards.map((c) => c.name.toLowerCase()));
}

/* Applies the bracket's card limits to candidate pools, in order of
   preference (the first pool's cards win a capped slot). Banned cards are
   dropped; capped ones (Game Changers in bracket 3, extra-turn cards in
   brackets 2 and 3) keep only the first few that appear across all pools,
   so the finished deck can't go over however the picks fall. Returns the
   filtered pools in the same order. */
export function applyBracketLimits(pools, limits, gameChangers, { gameChangersUsed = 0 } = {}) {
  let gcLeft = limits.gameChangers - gameChangersUsed;
  let turnsLeft = limits.extraTurns;
  return pools.map((pool) =>
    pool.filter((card) => {
      const key = card.name.toLowerCase();
      if (!limits.massLandDenial && MASS_LAND_DENIAL.has(key)) return false;
      if (gameChangers.has(key)) {
        if (gcLeft <= 0) return false;
        gcLeft -= 1;
      }
      if (isExtraTurn(card)) {
        if (turnsLeft <= 0) return false;
        turnsLeft -= 1;
      }
      return true;
    })
  );
}

/* Two-card combos in a deck, from Commander Spellbook. Returns pairs of
   card names; throws if Spellbook can't be reached. The request goes
   through the site's own combos function (netlify/functions/combos.mjs);
   the phone apps run from a local address, so they use the live site's. */
const COMBOS_URL = typeof window !== "undefined" && /^https?:$/.test(window.location.protocol) && window.location.hostname !== "localhost"
  ? "/.netlify/functions/combos"
  : `${SITE_URL}/.netlify/functions/combos`;

export async function findTwoCardCombos(commanderName, names) {
  const res = await fetch(COMBOS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      commanders: [{ card: commanderName, quantity: 1 }],
      main: names.map((card) => ({ card, quantity: 1 })),
    }),
  });
  if (!res.ok) throw new Error(`Commander Spellbook responded ${res.status}`);
  return twoCardCombosFrom(await res.json());
}

export function twoCardCombosFrom(json) {
  const included = json?.results?.included || [];
  return included
    .map((combo) => (combo.uses || []).map((u) => u.card?.name || u.card || u.name).filter((n) => typeof n === "string"))
    .filter((cards) => cards.length === 2);
}

/* Breaks each combo by swapping one of its cards (never the commander)
   for the next alternative in the same role that isn't part of a combo.
   `alternatives` maps role → candidate names in order of preference.
   Returns the new picks and the names taken out. */
export function breakCombos(picks, combos, alternatives, commanderName) {
  const comboCards = new Set(combos.flat().map((n) => n.toLowerCase()));
  const inDeck = new Set(Object.values(picks).flat().map((c) => c.name.toLowerCase()));
  const next = { ...picks };
  const removed = [];
  combos.forEach((pair) => {
    if (pair.some((n) => removed.includes(n))) return; // already broken
    const target = pair.find((n) => n.toLowerCase() !== commanderName.toLowerCase() && roleOf(next, n));
    if (!target) return;
    const cat = roleOf(next, target);
    const swapIn = (alternatives[cat] || []).find((n) => !inDeck.has(n.toLowerCase()) && !comboCards.has(n.toLowerCase()));
    next[cat] = swapIn
      ? next[cat].map((c) => (c.name === target ? { name: swapIn } : c))
      : next[cat].filter((c) => c.name !== target);
    if (swapIn) inDeck.add(swapIn.toLowerCase());
    removed.push(target);
  });
  return { picks: next, removed };
}

function roleOf(picks, name) {
  return Object.keys(picks).find((cat) => picks[cat].some((c) => c.name === name));
}
