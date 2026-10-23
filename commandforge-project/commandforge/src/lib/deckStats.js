// Mana curve and card-type counts for a built deck's spells (lands aside).
// Cards with no mana value on record (older saved decks) are left out.

const TYPE_ORDER = ["Creature", "Planeswalker", "Battle", "Instant", "Sorcery", "Artifact", "Enchantment"];
export const CURVE_BUCKETS = ["0", "1", "2", "3", "4", "5", "6", "7+"];

export function deckStats(picks, cardData) {
  const curve = CURVE_BUCKETS.map(() => 0);
  const types = {};
  let total = 0;
  let counted = 0;
  Object.values(picks).flat().forEach((c) => {
    const data = cardData[c.name.toLowerCase()];
    if (data?.cmc == null) return;
    curve[Math.min(7, Math.floor(data.cmc))] += 1;
    total += data.cmc;
    counted += 1;
    const type = TYPE_ORDER.find((t) => (data.typeLine || "").includes(t)) || "Other";
    types[type] = (types[type] || 0) + 1;
  });
  return {
    curve,
    counted,
    average: counted ? total / counted : null,
    types: Object.entries(types).sort((a, b) => b[1] - a[1]),
  };
}
