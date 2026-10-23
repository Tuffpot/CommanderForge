import { CURVE_BUCKETS, deckStats } from "../lib/deckStats";

// The spells' mana curve as bars, with the type split and average beside it.
export default function DeckStats({ picks, cardData }) {
  const { curve, counted, average, types } = deckStats(picks, cardData);
  if (counted < 10) return null;
  const tallest = Math.max(...curve, 1);

  return (
    <div className="cf-panel-alt rounded-xl p-4 sm:p-5 mb-6">
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <h3 className="cf-display text-base text-parchment">Mana curve</h3>
        <span className="text-xs text-parchment/50">
          Average mana value <span className="cf-mono text-brass">{average.toFixed(2)}</span>
        </span>
      </div>
      <div className="grid sm:grid-cols-[1fr_auto] gap-5 sm:gap-8 items-end">
        <div className="flex items-end gap-1.5 sm:gap-2 h-28" role="img" aria-label={`Mana curve: ${curve.map((n, i) => `${n} at ${CURVE_BUCKETS[i]}`).join(", ")}`}>
          {curve.map((n, i) => (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full gap-1">
              <span className="cf-mono text-[11px] text-parchment/60">{n || ""}</span>
              <div
                className="w-full rounded-t bg-gradient-to-t from-brass-deep to-brass"
                style={{ height: `${(n / tallest) * 100}%`, minHeight: n ? 3 : 0 }}
              />
              <span className="cf-mono text-[11px] text-parchment/45 border-t border-white/10 w-full text-center pt-1">
                {CURVE_BUCKETS[i]}
              </span>
            </div>
          ))}
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-1 gap-x-6 gap-y-1 text-xs min-w-[9rem]">
          {types.map(([type, n]) => (
            <div key={type} className="flex justify-between gap-4">
              <dt className="text-parchment/60">{type}</dt>
              <dd className="cf-mono text-parchment">{n}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
