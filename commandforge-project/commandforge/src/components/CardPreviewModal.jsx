import { ExternalLink, X } from "lucide-react";
import { formatPrice } from "../lib/budget";
import { scryfallCardPageUrl } from "../lib/scryfall";
import { PreviewImage } from "./CardImages";

export default function CardPreviewModal({ previewCard, priceSource, setPreviewCard }) {
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
      </div>
    </div>
  );
}
