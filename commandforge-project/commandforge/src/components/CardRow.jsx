import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ImageOff } from "lucide-react";
import { formatPrice } from "../lib/budget";

export default function CardRow({ name, qty, cardData, priceSource, onPreview }) {
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

  return (
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
      className={`w-full flex items-center gap-2.5 text-left rounded-lg -mx-1 px-1 py-1 transition ${
        showThumb ? "hover:bg-white/5 cursor-pointer" : "cursor-default"
      }`}
    >
      {showThumb && (
        <span className="w-8 h-6 rounded shrink-0 overflow-hidden bg-white/5 border border-white/10 flex items-center justify-center">
          {hasImage ? (
            <img src={data.imageSmall} alt="" className="w-full h-full object-cover" />
          ) : (
            <ImageOff size={11} className="text-white/20" />
          )}
        </span>
      )}
      <span className="text-sm text-white/85 leading-snug flex-1 min-w-0 truncate">
        {qty > 1 ? `${qty}× ` : ""}{name}
      </span>
      {showThumb && (
        <span className="cf-mono text-[11px] text-white/50 shrink-0">
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
}
