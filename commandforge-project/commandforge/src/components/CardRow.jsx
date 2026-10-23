import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ImageOff, Plus, X } from "lucide-react";
import { formatPrice } from "../lib/budget";

// `onRemove` or `onAdd` put a button beside the row to cut the card from
// the deck, or add it.
export default function CardRow({ name, qty, cardData, priceSource, onPreview, missing = false, onRemove = null, onAdd = null }) {
  const [hover, setHover] = useState(false);
  const [rect, setRect] = useState(null);
  const rowRef = useRef(null);
  const data = cardData[name.toLowerCase()];
  const price = priceSource === "eur" ? data?.priceEur : data?.priceUsd;
  const showThumb = priceSource !== "none";
  const hasImage = Boolean(data?.imageSmall);

  function updateRect() {
    if (rowRef.current) setRect(rowRef.current.getBoundingClientRect());
  }

  // Re-anchor the preview to the row's live on-screen position whenever the
  // page (or any scrollable ancestor) scrolls while it's showing, instead of
  // relying on a mouse coordinate that goes stale the moment you scroll
  // without also moving the cursor.
  useEffect(() => {
    if (!hover) return;
    const handler = () => updateRect();
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hover]);

  const PREVIEW_W = 240;
  const PREVIEW_H = Math.round(PREVIEW_W * 1.4);
  let left = 0;
  let top = 0;
  if (rect && typeof window !== "undefined") {
    left = rect.right + 12;
    top = rect.top - 14;
    if (left + PREVIEW_W > window.innerWidth) left = rect.left - PREVIEW_W - 12;
    if (top + PREVIEW_H > window.innerHeight) top = window.innerHeight - PREVIEW_H - 8;
    if (top < 8) top = 8;
    if (left < 8) left = 8;
  }

  const row = (
    <button
      ref={rowRef}
      onClick={() => onPreview({ name, ...(data || {}) })}
      // Pointer events rather than mouse events: on a phone a tap also fires
      // mouseenter but never mouseleave, which left the hover image stuck on
      // screen on top of the tap-to-preview popup.
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse" || !showThumb || !data?.imageLarge) return;
        updateRect();
        setHover(true);
      }}
      onPointerLeave={() => setHover(false)}
      className={`${onRemove || onAdd ? "flex-1 min-w-0" : "w-full"} flex items-center gap-2.5 text-left rounded-lg -mx-1 px-1 py-1 transition ${
        showThumb ? "hover:bg-white/5 cursor-pointer" : "cursor-default"
      }`}
    >
      {showThumb && (
        <span className="w-8 h-6 rounded shrink-0 overflow-hidden bg-white/5 border border-white/10 flex items-center justify-center">
          {hasImage ? (
            <img src={data.imageSmall} alt="" className="w-full h-full object-cover" />
          ) : (
            <ImageOff size={11} className="text-parchment/20" />
          )}
        </span>
      )}
      <span className="text-sm text-parchment/85 leading-snug flex-1 min-w-0 truncate">
        {qty > 1 ? `${qty}× ` : ""}{name}
      </span>
      {missing && (
        <span title="Not in your collection" className="cf-mono text-[9px] font-semibold tracking-wide text-amber-300 border border-amber-300/40 rounded px-1 shrink-0">
          NEED
        </span>
      )}
      {showThumb && (
        <span className="cf-mono text-[11px] text-parchment/50 shrink-0">
          {formatPrice(price, priceSource)}
        </span>
      )}

      {hover && showThumb && data?.imageLarge && rect &&
        createPortal(
          <img
            src={data.imageLarge}
            alt=""
            className="fixed z-50 rounded-lg shadow-2xl border border-white/20 pointer-events-none"
            style={{ left, top, width: PREVIEW_W }}
          />,
          document.body
        )}
    </button>
  );

  if (!onRemove && !onAdd) return row;
  return (
    <div className="flex items-center gap-1">
      {row}
      {onAdd ? (
        <button
          onClick={onAdd}
          aria-label={`Add ${name} to the deck`}
          title="Add to the deck"
          className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-full border border-brass/40 text-[11px] font-semibold text-brass hover:border-brass hover:text-parchment transition"
        >
          <Plus size={12} /> Add
        </button>
      ) : (
        <button
          onClick={onRemove}
          aria-label={`Cut ${qty > 1 ? `one ${name}` : name} from the deck`}
          title="Cut from the deck"
          className="shrink-0 p-1.5 -mr-1.5 rounded-full text-parchment/35 hover:text-red-300 hover:bg-white/5 transition"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
