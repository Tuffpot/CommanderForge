import { ArrowLeftRight, ExternalLink, Plus, Trash2, X } from "lucide-react";
import { formatPrice } from "../lib/budget";
import { scryfallCardPageUrl } from "../lib/scryfall";
import { PreviewImage } from "./CardImages";

// `onAdd` and `onRemove`, when given, offer to add the card to the deck
// being looked at, or cut it.
export default function CardPreviewModal({ previewCard, priceSource, setPreviewCard, swapOptions = [], onSwap, onAdd = null, onRemove = null }) {
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 sm:p-6 z-20" onClick={() => setPreviewCard(null)}>
      <div className="cf-panel rounded-2xl p-5 w-full max-w-xs max-h-full overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-end mb-2">
          <button onClick={() => setPreviewCard(null)} className="-m-2 p-2 text-parchment/40 hover:text-parchment transition" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <PreviewImage imageUrl={previewCard.imageLarge} name={previewCard.name} />
        <p className="text-sm font-semibold text-parchment mb-1">{previewCard.name}</p>
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs text-parchment/50">
            {priceSource === "eur" ? "Cardmarket" : "TCGplayer"} price
          </span>
          <span className="cf-mono text-sm cf-gold font-semibold">
            {formatPrice(priceSource === "eur" ? previewCard.priceEur : previewCard.priceUsd, priceSource)}
          </span>
        </div>
        <a
          href={previewCard.scryfallUri || scryfallCardPageUrl(previewCard.name)}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center justify-center gap-2 py-2.5 cf-btn-quiet"
        >
          View on Scryfall <ExternalLink size={14} />
        </a>
        {onAdd && (
          <button onClick={onAdd} className="w-full mt-2 py-2.5 cf-btn-primary">
            <Plus size={15} /> Add to deck
          </button>
        )}
        {onRemove && (
          <button onClick={onRemove} className="w-full mt-2 py-2.5 cf-btn-quiet text-red-300/90">
            <Trash2 size={14} /> Cut from deck
          </button>
        )}
        {swapOptions.length > 0 && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <p className="cf-eyebrow mb-2">Swap it for</p>
            <div className="space-y-1.5">
              {swapOptions.map((c) => (
                <button
                  key={c.name}
                  onClick={() => onSwap(c.name)}
                  className="w-full flex items-center gap-2.5 text-left px-2.5 py-2 rounded-xl border border-white/10 bg-black/25 hover:border-brass/50 transition"
                >
                  {c.imageSmall && <img src={c.imageSmall} alt="" className="w-8 h-6 rounded object-cover shrink-0" />}
                  <span className="text-sm text-parchment/85 flex-1 min-w-0 truncate">{c.name}</span>
                  {priceSource !== "none" && (
                    <span className="cf-mono text-[11px] text-parchment/50 shrink-0">
                      {formatPrice(priceSource === "eur" ? c.priceEur : c.priceUsd, priceSource)}
                    </span>
                  )}
                  <ArrowLeftRight size={13} className="text-brass/70 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
