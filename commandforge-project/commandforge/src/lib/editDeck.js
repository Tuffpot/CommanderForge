import { BASIC_LAND } from "./colors";
import { isExtraTurn } from "./bracketRules";

/* Hand edits to a built or saved deck: adding and cutting cards, and
   evening the count out with basic lands. Each takes a deck and returns a
   new one. */

export const DECK_SIZE = 99;

const lower = (name) => name.toLowerCase();

// Cards in the 99, basics counted one by one.
export function deckSize(deck) {
  return (
    Object.values(deck.picks).flat().length +
    deck.nonbasics.reduce((s, l) => s + l.qty, 0) +
    deck.basics.reduce((s, l) => s + l.qty, 0)
  );
}

export function deckHas(deck, name) {
  const key = lower(name);
  const commanderName = typeof deck.commander === "string" ? deck.commander : deck.commander?.name;
  return (
    (commanderName && lower(commanderName) === key) ||
    Object.values(deck.picks).flat().some((c) => lower(c.name) === key) ||
    deck.nonbasics.some((l) => lower(l.name) === key)
  );
}

const isBasicName = (name) => Object.values(BASIC_LAND).some((b) => lower(b) === lower(name));

/* Adds a card. `role` is the deck role it fills, or "lands". Basic lands
   just raise their count; any other card already in the deck is left out,
   as Commander allows one copy. `data` is the card in the app's shape, so
   the bracket check's Game Changer and extra-turn lists stay current. */
export function addCard(deck, name, role, data = null) {
  if (isBasicName(name)) {
    const has = deck.basics.some((b) => lower(b.name) === lower(name));
    return {
      ...deck,
      basics: has ? deck.basics.map((b) => (lower(b.name) === lower(name) ? { ...b, qty: b.qty + 1 } : b)) : [...deck.basics, { name, qty: 1 }],
    };
  }
  if (deckHas(deck, name)) return deck;
  const alternatives = deck.alternatives?.[role]
    ? { ...deck.alternatives, [role]: deck.alternatives[role].filter((n) => lower(n) !== lower(name)) }
    : deck.alternatives;
  const suggestions = removeSuggestion(deck.suggestions, name);
  const check = deck.bracketCheck && {
    ...deck.bracketCheck,
    gameChangers: data?.gameChanger ? [...deck.bracketCheck.gameChangers, name] : deck.bracketCheck.gameChangers,
    extraTurns: isExtraTurn(data) ? [...deck.bracketCheck.extraTurns, name] : deck.bracketCheck.extraTurns,
    // Spellbook only checked the deck as built.
    combos: deck.bracketCheck.combos === "not-needed" ? "not-needed" : "edited",
  };
  if (role === "lands") {
    return { ...deck, alternatives, suggestions, bracketCheck: check, nonbasics: [...deck.nonbasics, { name, qty: 1 }] };
  }
  return {
    ...deck,
    alternatives,
    suggestions,
    bracketCheck: check,
    picks: { ...deck.picks, [role]: [...(deck.picks[role] || []), { name }] },
  };
}

function removeSuggestion(suggestions, name) {
  if (!suggestions) return suggestions;
  const next = {};
  Object.entries(suggestions).forEach(([role, names]) => {
    const left = names.filter((n) => lower(n) !== lower(name));
    if (left.length) next[role] = left;
  });
  return next;
}

// Takes one copy of a card out of the deck.
export function removeCard(deck, name) {
  const key = lower(name);
  const basics = deck.basics
    .map((b) => (lower(b.name) === key ? { ...b, qty: b.qty - 1 } : b))
    .filter((b) => b.qty > 0);
  const picks = Object.fromEntries(Object.entries(deck.picks).map(([role, cards]) => [role, cards.filter((c) => lower(c.name) !== key)]));
  const check = deck.bracketCheck && {
    ...deck.bracketCheck,
    gameChangers: deck.bracketCheck.gameChangers.filter((n) => lower(n) !== key || lower(n) === lower(deck.commander.name)),
    extraTurns: deck.bracketCheck.extraTurns.filter((n) => lower(n) !== key),
  };
  return { ...deck, picks, basics, bracketCheck: check, nonbasics: deck.nonbasics.filter((l) => lower(l.name) !== key) };
}

// The deck's basic land names, one per colour (Wastes for colourless).
function basicNames(identity) {
  return (identity.length ? identity : ["C"]).map((c) => BASIC_LAND[c]);
}

// Brings the deck to 99 by adding or cutting basic lands, the most
// plentiful basic first when cutting and the scarcest first when adding.
// Spells are never cut: if the basics run out first, the deck stays over.
export function evenOutWithBasics(deck, identity) {
  let next = deck;
  for (let size = deckSize(next); size !== DECK_SIZE; size = deckSize(next)) {
    if (size > DECK_SIZE) {
      const most = next.basics.reduce((a, b) => (!a || b.qty > a.qty ? b : a), null);
      if (!most) break;
      next = removeCard(next, most.name);
    } else {
      const counts = basicNames(identity).map((n) => ({ name: n, qty: next.basics.find((b) => b.name === n)?.qty || 0 }));
      next = addCard(next, counts.reduce((a, b) => (b.qty < a.qty ? b : a)).name, "lands");
    }
  }
  return next;
}
