import { singularType } from "./queries";

/* Some popular cards only do something in a deck built around them: Mystic
   Forge or an affinity card wants a pile of artifacts, an Elf lord wants
   Elves. They rank highly in their roles because the decks that run them
   run them a lot, so without a check they turn up in decks that can't use
   them. Each rule spots the payoff from its rules text. The card stays only
   when that's the deck's theme: the commander cares about it, or it's the
   theme the person picked. A deck that ends up full of those cards anyway
   (`min` of them) counts too, but ordinary decks never get there: a deck's
   mana rocks alone don't make it an artifact deck. */
const TYPE_RULES = [
  {
    payoff: /\b(artifact|colorless) spells?\b|\bartifacts? you control\b|\bwhenever (an|another) artifact\b|\bfor each artifact\b|\baffinity for artifacts\b|\bimprovise\b|\bmetalcraft\b/i,
    theme: /\bartifacts?\b/i,
    supports: (typeLine) => /\bArtifact\b/.test(typeLine),
    min: 30,
  },
  {
    payoff: /\benchantment spells?\b|\benchantments? you control\b|\bwhenever (an|another) enchantment\b|\bconstellation\b/i,
    theme: /\benchantments?\b|\benchantress\b/i,
    supports: (typeLine) => /\bEnchantment\b/.test(typeLine),
    min: 25,
  },
  {
    payoff: /\bequipment you control\b|\bequipment spells?\b|\battach target equipment\b|\bbecomes equipped\b/i,
    theme: /\bequip(ment|ped)?\b|\bvoltron\b/i,
    supports: (typeLine) => /\bEquipment\b/.test(typeLine),
    min: 12,
  },
  {
    payoff: /\baura spells?\b|\bauras? you control\b|\bwhenever an aura\b/i,
    theme: /\bauras?\b|\benchanted\b|\bvoltron\b/i,
    supports: (typeLine) => /\bAura\b/.test(typeLine),
    min: 12,
  },
  {
    payoff: /\binstant (and|or) sorcery spells?\b|\binstants? and sorcer(y|ies) you\b/i,
    theme: /\binstant\b|\bsorcer(y|ies)\b|\bspellslinger\b|\bnoncreature spell\b/i,
    supports: (typeLine) => /\b(Instant|Sorcery)\b/.test(typeLine),
    min: 30,
  },
  {
    payoff: /\blegendary spells?\b|\bhistoric spells?\b/i,
    theme: /\blegendary\b|\bhistoric\b|\blegends\b/i,
    supports: (typeLine) => /\bLegendary\b/.test(typeLine),
    min: 20,
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
   every card in it as card data (with typeLine and oracleText), and `theme`
   is the theme the person picked or the one guessed for the commander. */
export function relevanceCheck(commander, deck, theme = "") {
  const commanderText = oracleOf(commander);
  const themeText = `${commanderText}\n${theme || ""}`;
  const commanderType = commander.typeLine || commander.blurb || "";
  const all = [{ ...commander, typeLine: commanderType }, ...deck];
  const countWhere = (test, except) => all.filter((c) => c !== except && c.name !== except?.name && test(c.typeLine || "")).length;

  return (card) => {
    const text = oracleOf(card);
    if (!text) return true;
    for (const rule of TYPE_RULES) {
      if (!rule.payoff.test(text) || rule.theme.test(themeText)) continue;
      if (countWhere(rule.supports, card) < rule.min) return false;
    }
    const tribal = text.match(TRIBAL_PAYOFF);
    const word = tribal && tribal.slice(1).find(Boolean);
    if (word && !NOT_TRIBES.has(word)) {
      const type = singularType(word);
      const shared = themeText.includes(word) || new RegExp(`\\b${type}\\b`).test(commanderType);
      if (!shared && countWhere((t) => new RegExp(`\\b${type}\\b`).test(t), card) < TRIBAL_MIN) return false;
    }
    return true;
  };
}

/* Swaps out picks that don't earn their place for the next card in the
   same role that does. `poolFor(role, card)` lists the candidates to
   replace `card`, best first; `allowed(card)` rules out anything else the deck can't take. */
export function dropIrrelevant(picks, commander, cardData, poolFor, allowed = () => true, theme = "") {
  const dataOf = (c) => cardData[c.name.toLowerCase()] || c;
  const deck = Object.values(picks).flat().map(dataOf);
  const fits = relevanceCheck(commander, deck, theme);
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
