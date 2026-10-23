import { CAT_LABELS } from "./buildDeck";

// Decklists in the text formats other sites import. Each takes the commander's
// name and the deck's picks, nonbasic lands and basic lands, so it works for a
// fresh build and a saved deck alike.

// Moxfield's importer reads "<quantity> <card name>" lines. It can't be told
// which card is the commander in text, so the commander goes first and the
// person picks it in Moxfield's import dialog.
export function moxfieldList(commanderName, picks, nonbasics, basics = []) {
  const lines = [`1 ${commanderName}`];
  Object.values(picks).flat().forEach((c) => lines.push(`1 ${c.name}`));
  [...nonbasics, ...basics].forEach((l) => lines.push(`${l.qty} ${l.name}`));
  return lines.join("\n");
}

// Archidekt reads "<quantity>x <card name> [Category]". A "Commander{top}"
// category puts the commander in the command zone, and the deck arrives
// already sorted into Brewhall's roles.
export function archidektList(commanderName, picks, nonbasics, basics = []) {
  const lines = [`1x ${commanderName} [Commander{top}]`];
  Object.entries(picks).forEach(([cat, cards]) => {
    const label = archidektCategory(CAT_LABELS[cat] || "Utility");
    cards.forEach((c) => lines.push(`1x ${c.name} [${label}]`));
  });
  [...nonbasics, ...basics].forEach((l) => lines.push(`${l.qty}x ${l.name} [Land]`));
  return lines.join("\n");
}

// Archidekt splits categories on commas and treats square brackets as the
// end of the tag, so keep labels to plain words.
function archidektCategory(label) {
  return label.replace(/[[\],{}]/g, "").replace(/&/g, "and");
}

// Cardmarket's wants-list importer accepts plain "<quantity> <card name>"
// lines pasted straight in, confirmed via their own help docs. Basics are
// left out since nobody actually needs to buy Plains or Islands.
export function cardmarketList(commanderName, picks, nonbasics) {
  return moxfieldList(commanderName, picks, nonbasics, []);
}

// For a collection build: only the cards the person doesn't own yet,
// plus the suggested ones for roles the collection is short on.
export function neededList(deck) {
  const lines = [];
  if (!deck.commanderOwned) lines.push(`1 ${deck.commander.name}`);
  Object.values(deck.picks).flat().filter((c) => c.missing).forEach((c) => lines.push(`1 ${c.name}`));
  Object.values(deck.suggestions || {}).flat().forEach((name) => lines.push(`1 ${name}`));
  return lines.join("\n");
}
