// Where card images and prices come from. Scryfall supplies both, with
// dollar prices from TCGplayer and euro prices from Cardmarket.
export const PRICE_SOURCES = [
  { id: "none", label: "No prices" },
  { id: "usd", label: "TCGplayer ($)" },
  { id: "eur", label: "Cardmarket (€)" },
];

export default function PriceSourcePicker({ priceSource, setPriceSource, compact = false }) {
  return (
    <div className={`flex ${compact ? "flex-row" : "flex-col sm:flex-row"} gap-2`}>
      {PRICE_SOURCES.map((opt) => (
        <button
          key={opt.id}
          onClick={() => setPriceSource(opt.id)}
          aria-pressed={priceSource === opt.id}
          className={`cf-choice flex-1 font-semibold text-parchment/80 ${compact ? "py-2 px-1.5 text-xs" : "py-2.5 text-sm"}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
