import { CATEGORY_TESTS, fitsIdentity, fullText, isBasicLand, isLand, legalInCommander, parseCardList } from "./collection";
import { fetchCardsByName, mapScryfallCard } from "./scryfall";

/* The person's must-include and banned cards. Banned cards never make a
   deck. Must-include cards always do, each taking the place of the last
   card picked for the same job, and they stay through the budget trim and
   the combo check. */

// The order a card's job is guessed in, as the collection builder fills
// roles. Anything that matches none of them counts as synergy.
const ROLE_ORDER = ["ramp", "removal", "draw", "protection", "wincon", "utility"];

// Card names from a typed or pasted list, once each, quantities and set
// codes dropped.
export function parseNameList(text) {
  const seen = new Set();
  return parseCardList(text || "")
    .map((e) => e.name)
    .filter((name) => {
      const key = name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

// A deck role for one of Scryfall's cards, read from its rules text.
// Lands come back as "lands".
export function roleFor(card) {
  if (isLand(card)) return "lands";
  const text = fullText(card);
  return ROLE_ORDER.find((role) => CATEGORY_TESTS[role](card, text)) || "synergy";
}

// Whether a typed name means this card: its full name, or the front face's
// name for a two-faced card.
export function nameMatches(card, name) {
  const key = name.toLowerCase();
  const full = card.name.toLowerCase();
  return full === key || full.split(" // ")[0] === key;
}

/* Looks the must-include names up on Scryfall and checks each can go in a
   deck with this commander. Returns { cards, issues }: `cards` are the
   ones that can, as { name, role, data } with `data` in the app's card
   shape, and `issues` the ones that can't, as { name, reason }. */
export async function resolveIncludes(names, commander, priceSource = "none") {
  if (!names.length) return { cards: [], issues: [] };
  let found = [];
  try {
    found = await fetchCardsByName(names, priceSource);
  } catch {
    return { cards: [], issues: names.map((name) => ({ name, reason: "unreachable" })) };
  }
  const cards = [];
  const issues = [];
  names.forEach((name) => {
    const card = found.find((c) => nameMatches(c, name));
    if (!card) issues.push({ name, reason: "not-found" });
    else if (card.name.toLowerCase() === commander.name.toLowerCase()) issues.push({ name: card.name, reason: "commander" });
    else if (isBasicLand(card)) issues.push({ name: card.name, reason: "basic" });
    else if (!legalInCommander(card)) issues.push({ name: card.name, reason: "not-legal" });
    else if (!fitsIdentity(card, commander.identity)) issues.push({ name: card.name, reason: "off-colour" });
    else if (!cards.some((c) => c.name === card.name)) cards.push({ name: card.name, role: roleFor(card), data: mapScryfallCard(card) });
  });
  return { cards, issues };
}

/* Puts must-include cards into a finished deck. `deck` is { picks,
   nonbasics, basics }; `includes` are { name, role, missing? }. A spell
   goes into its role in place of that role's last pick (the busiest role's,
   if its own has nothing left to give up). A land takes a basic land's
   place. Cards already in the deck stay where they are. Returns the new
   { picks, nonbasics, basics } and the names cut. */
export function forceIncludes(deck, includes) {
  const picks = Object.fromEntries(Object.entries(deck.picks).map(([role, cards]) => [role, [...cards]]));
  const nonbasics = deck.nonbasics.map((l) => ({ ...l }));
  const basics = deck.basics.map((l) => ({ ...l }));
  const keep = new Set(includes.map((c) => c.name.toLowerCase()));
  const kept = (c) => keep.has(c.name.toLowerCase());
  const inDeck = (name) =>
    Object.values(picks).flat().some((c) => c.name.toLowerCase() === name.toLowerCase()) ||
    nonbasics.some((l) => l.name.toLowerCase() === name.toLowerCase());
  const cut = [];

  const cutBasic = () => {
    const biggest = basics.reduce((a, b) => (!a || b.qty > a.qty ? b : a), null);
    if (!biggest) return false;
    cut.push(biggest.name);
    biggest.qty -= 1;
    if (!biggest.qty) basics.splice(basics.indexOf(biggest), 1);
    return true;
  };
  const cutLast = (list) => {
    for (let i = list.length - 1; i >= 0; i--) {
      if (kept(list[i])) continue;
      cut.push(list[i].name);
      list.splice(i, 1);
      return true;
    }
    return false;
  };
  const cutSpell = (role) => {
    if (picks[role] && cutLast(picks[role])) return true;
    const busiest = Object.keys(picks)
      .filter((r) => picks[r].some((c) => !kept(c)))
      .sort((a, b) => picks[b].length - picks[a].length)[0];
    return busiest ? cutLast(picks[busiest]) : false;
  };

  includes.forEach((card) => {
    if (inDeck(card.name)) return;
    const entry = card.missing ? { name: card.name, missing: true } : { name: card.name };
    if (card.role === "lands") {
      if (cutBasic() || cutLast(nonbasics) || cutSpell("synergy")) nonbasics.push({ name: card.name, qty: 1 });
      return;
    }
    const role = picks[card.role] ? card.role : "synergy";
    if (!picks[role]) picks[role] = [];
    if (cutSpell(role) || cutBasic() || cutLast(nonbasics)) picks[role].push(entry);
  });
  return { picks, nonbasics, basics, cut };
}

// What the result screen says about a must-include it couldn't use.
export function includeIssueText(issue, commanderName) {
  switch (issue.reason) {
    case "not-found": return `${issue.name}: no card by that name on Scryfall`;
    case "commander": return `${issue.name}: it's already your commander`;
    case "basic": return `${issue.name}: basic lands are added automatically`;
    case "not-legal": return `${issue.name}: banned in Commander`;
    case "off-colour": return `${issue.name}: outside ${commanderName}'s colours`;
    default: return `${issue.name}: couldn't reach Scryfall to look it up`;
  }
}
