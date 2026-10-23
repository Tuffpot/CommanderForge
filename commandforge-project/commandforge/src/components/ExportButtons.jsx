import { Check, ClipboardCopy } from "lucide-react";

// What to tell someone once a list is on their clipboard.
const NEXT_STEP = {
  moxfield: "Copied. In Moxfield, make a new deck, choose Import, paste, and pick your commander.",
  archidekt: "Copied. In Archidekt, make a new deck, choose Import, and paste. Your commander and card roles come with it.",
  cardmarket: "Copied. Paste it into a Cardmarket wants list.",
  needed: "Copied. Paste it into a Cardmarket wants list.",
};

export default function ExportButtons({ copied, copyDeck, copyError, deck, needed = null, compact = false }) {
  const targets = [
    { id: "moxfield", label: "Moxfield" },
    { id: "archidekt", label: "Archidekt" },
    needed === null
      ? { id: "cardmarket", label: "Cardmarket" }
      : { id: "needed", label: "Missing cards", disabled: needed === 0 },
  ];
  const status = copyError
    ? "Couldn't copy. Your browser may be blocking clipboard access."
    : copied && NEXT_STEP[copied];

  return (
    <div>
      <p className={`cf-eyebrow ${compact ? "mb-1.5" : "mb-2"}`}>Copy this deck for</p>
      <div className="grid grid-cols-3 gap-2">
        {targets.map((t) => (
          <button
            key={t.id}
            onClick={() => copyDeck(t.id, deck)}
            disabled={t.disabled}
            className={`cf-btn-quiet px-2 gap-1.5 whitespace-nowrap ${compact ? "py-2 text-xs" : "py-2.5 text-xs sm:text-sm"}`}
            title={t.id === "needed" ? "Only the cards you don't own yet, for a Cardmarket wants list" : t.id === "cardmarket" ? "For a Cardmarket wants list" : undefined}
          >
            {copied === t.id ? <Check size={14} className="text-green-400" /> : <ClipboardCopy size={14} />}
            {t.label}
          </button>
        ))}
      </div>
      <p className={`text-xs mt-2 min-h-[1rem] ${copyError ? "text-red-300/80" : "text-parchment/50"}`} aria-live="polite">
        {status || ""}
      </p>
    </div>
  );
}
