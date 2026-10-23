import { Loader2 } from "lucide-react";
import CardRow from "../components/CardRow";
import ColorPips from "../components/ColorPips";
import DeckStats from "../components/DeckStats";
import ExportButtons from "../components/ExportButtons";
import { CAT_LABELS } from "../lib/buildDeck";

// A deck someone shared with a link. Read-only: anyone can look, copy it to
// another site, or go and brew their own.
export default function SharedDeckView({ copied, copyDeck, copyError, reset, setPreviewCard, sharedDeck }) {
  if (sharedDeck.status === "loading") {
    return (
      <p className="text-sm text-parchment/50 flex items-center justify-center gap-2 py-16">
        <Loader2 size={14} className="animate-spin" /> Opening the deck…
      </p>
    );
  }

  if (sharedDeck.status !== "ready") {
    return (
      <div className="cf-fade cf-panel rounded-2xl p-8 sm:p-10 text-center">
        <h1 className="cf-display text-2xl text-parchment mb-2">This deck isn't shared any more</h1>
        <p className="text-sm text-parchment/55 mb-6 max-w-sm mx-auto">
          Its owner may have stopped sharing it or deleted it. You can still brew a deck of your own.
        </p>
        <button onClick={reset} className="cf-btn-primary px-6 py-3">Brew a deck</button>
      </div>
    );
  }

  const d = sharedDeck.deck;
  const cardData = d.cardData || {};
  const priceSource = d.priceSource || "none";
  const lands = [...d.nonbasics, ...d.basics];

  return (
    <div className="cf-fade">
      <div className="cf-panel rounded-2xl p-5 sm:p-6 mb-6">
        <p className="cf-eyebrow mb-2">A deck shared from Brewhall</p>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="cf-display text-2xl sm:text-3xl text-parchment break-words">{d.deckName}</h1>
            <p className="text-sm text-parchment/55 mt-1.5">
              {d.commander} · {d.bracketName}
            </p>
          </div>
          <ColorPips identity={d.identity} />
        </div>
      </div>

      <DeckStats picks={d.picks} cardData={cardData} />

      <div className="space-y-3 mb-6">
        <div className="cf-panel-alt rounded-xl p-4">
          <SectionHeading label="Commander" count={1} />
          <CardRow name={d.commander} qty={1} cardData={cardData} priceSource={priceSource} onPreview={setPreviewCard} />
        </div>
        {Object.entries(d.picks).map(([cat, cards]) =>
          cards.length ? (
            <div key={cat} className="cf-panel-alt rounded-xl p-4">
              <SectionHeading label={CAT_LABELS[cat]} count={cards.length} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                {cards.map((c) => (
                  <CardRow key={c.name} name={c.name} qty={1} cardData={cardData} priceSource={priceSource} onPreview={setPreviewCard} />
                ))}
              </div>
            </div>
          ) : null
        )}
        <div className="cf-panel-alt rounded-xl p-4">
          <SectionHeading label="Lands" count={lands.reduce((a, l) => a + l.qty, 0)} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
            {lands.map((l) => (
              <CardRow key={l.name} name={l.name} qty={l.qty} cardData={cardData} priceSource={priceSource} onPreview={setPreviewCard} />
            ))}
          </div>
        </div>
      </div>

      <div className="cf-panel rounded-2xl p-4 sm:p-5 mb-8">
        <ExportButtons copied={copied} copyDeck={copyDeck} copyError={copyError} deck={d} />
      </div>

      <div className="text-center">
        <p className="text-sm text-parchment/55 mb-4">Want one like it? Pick any commander and Brewhall builds the 99 in seconds.</p>
        <button onClick={reset} className="cf-btn-primary px-6 py-3">Brew your own deck</button>
      </div>
    </div>
  );
}

function SectionHeading({ label, count }) {
  return (
    <div className="flex items-baseline justify-between gap-3 mb-2 pb-1.5 border-b border-white/[0.06]">
      <h2 className="cf-display text-base text-parchment">{label}</h2>
      <span className="cf-mono text-xs text-brass/70">{count}</span>
    </div>
  );
}
