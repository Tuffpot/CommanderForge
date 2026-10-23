import { singularType } from "./queries";

/* Some popular cards only do something in a deck built around them: Mystic
   Forge wants a pile of artifacts, an Elf lord wants Elves. They rank highly
   in their roles because the decks that run them run them a lot, so without
   a check they turn up in decks that can't use them. Each rule spots the
   payoff from its rules text and says how many supporting cards the deck
   needs before the card earns its slot. */
const TYPE_RULES = [
  {
    payoff: /\b(artifact|colorless) spells?\b|\bartifacts? you control\b|\bwhenever (an|another) artifact\b|\bfor each artifact\b/i,
    supports: (typeLine) => /\bArtifact\b/.test(typeLine),
    min: 15,
  },
  {
    payoff: /\benchantment spells?\b|\benchantments? you control\b|\bwhenever (an|another) enchantment\b|\bconstellation\b/i,
    supports: (typeLine) => /\bEnchantment\b/.test(typeLine),
    min: 10,
  },
  {
    payoff: /\bequipment you control\b|\bequipment spells?\b|\battach target equipment\b|\bbecomes equipped\b/i,
    supports: (typeLine) => /\bEquipment\b/.test(typeLine),
    min: 6,
  },
  {
    payoff: /\baura spells?\b|\bauras? you control\b|\bwhenever an aura\b/i,
    supports: (typeLine) => /\bAura\b/.test(typeLine),
    min: 6,
  },
  {
    payoff: /\binstant (and|or) sorcery spells?\b|\binstants? and sorcer(y|ies) you\b/i,
    supports: (typeLine) => /\b(Instant|Sorcery)\b/.test(typeLine),
    min: 15,
  },
  {
    payoff: /\blegendary spells?\b|\bhistoric spells?\b/i,
    supports: (typeLine) => /\bLegendary\b/.test(typeLine),
    min: 10,
  },
];

// Creature-type lords and payoffs: "other Zombies you control get +1/+1",
// "for each Elf you control", "whenever you cast a Dragon spell".
const TRIBAL_PAYOFF = /\b(?<!-)([A-Z][a-z]+)(?:s| creatures)? you control (?:get|have)\b|\bfor each ([A-Z][a-z]+) you control\b|\bwhenever you cast an? ([A-Z][a-z]+) spell\b|\b([A-Z][a-z]+) spells you cast cost\b/;
const TRIBAL_MIN = 10;
// Capitalised words the pattern can catch that aren't creature types.
const NOT_TRIBES = new Set([
  "Creature", "Token", "Permanent", "Spell", "Artifact", "Enchantment", "Land", "Planeswalker", "Equipment",
  "Aura", "Vehicle", "Legendary", "Nonland", "Noncreature", "Other", "Each", "All", "Attacking", "Untapped", "Tapped",
]);

function oracleOf(card) {
  return card?.oracleText || card?.oracle_text || "";
}

/* Returns a test for whether a card earns its place in this deck. `deck` is
   every card in it as card data (with typeLine and oracleText); the
   commander counts, and a payoff the commander itself shares is always
   fine, since the commander is the theme. */
export function relevanceCheck(commander, deck) {
  const commanderText = oracleOf(commander);
  const commanderType = commander.typeLine || commander.blurb || "";
  const all = [{ ...commander, typeLine: commanderType }, ...deck];
  const countWhere = (test, except) => all.filter((c) => c !== except && c.name !== except?.name && test(c.typeLine || "")).length;

  return (card) => {
    const text = oracleOf(card);
    if (!text) return true;
    for (const rule of TYPE_RULES) {
      if (!rule.payoff.test(text) || rule.payoff.test(commanderText)) continue;
      if (countWhere(rule.supports, card) < rule.min) return false;
    }
    const tribal = text.match(TRIBAL_PAYOFF);
    const word = tribal && tribal.slice(1).find(Boolean);
    if (word && !NOT_TRIBES.has(word)) {
      const type = singularType(word);
      const shared = commanderText.includes(word) || new RegExp(`\\b${type}\\b`).test(commanderType);
      if (!shared && countWhere((t) => new RegExp(`\\b${type}\\b`).test(t), card) < TRIBAL_MIN) return false;
    }
    return true;
  };
}

/* Swaps out picks that don't earn their place for the next card in the
   same role that does. `poolFor(role, card)` lists the candidates to
   replace `card`, best first; `allowed(card)` rules out anything else the deck can't take. */
export function dropIrrelevant(picks, commander, cardData, poolFor, allowed = () => true) {
  const dataOf = (c) => cardData[c.name.toLowerCase()] || c;
  const deck = Object.values(picks).flat().map(dataOf);
  const fits = relevanceCheck(commander, deck);
  const inDeck = new Set(deck.map((c) => c.name.toLowerCase()));
  const next = {};
  const swaps = [];
  Object.entries(picks).forEach(([role, cards]) => {
    next[role] = cards.map((card) => {
      if (fits(dataOf(card))) return card;
      const swapIn = poolFor(role, card).find((c) => !inDeck.has(c.name.toLowerCase()) && allowed(c) && fits(dataOf(c)));
      if (!swapIn) return card;
      inDeck.add(swapIn.name.toLowerCase());
      swaps.push({ role, from: card, to: swapIn });
      return swapIn;
    });
  });
  return { picks: next, swaps, fits };
}
