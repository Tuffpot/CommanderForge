import { Check, ChevronLeft, ClipboardCopy, Loader2, Save } from "lucide-react";
import { CommanderArt } from "../components/CardImages";
import AdSlot from "../components/AdSlot";
import CardRow from "../components/CardRow";
import ColorPips from "../components/ColorPips";
import { formatPrice, priceOf } from "../lib/budget";
import { CAT_LABELS } from "../lib/buildDeck";
import { describeDeck } from "../lib/describeDeck";

export default function ResultView({
  cardData,
  cardDataStatus,
  cardmarketCopied,
  cardmarketCopyError,
  copyForCardmarket,
  deck,
  deckTotalPrice,
  openAuthModal,
  priceSource,
  reset,
  session,
  setPreviewCard,
  setSaveModalOpen,
}) {
  return (
    <div className="cf-fade">
      <button onClick={reset} className="flex items-center gap-1 text-sm text-white/50 hover:text-white/80 mb-5 transition">
        <ChevronLeft size={16} /> Back
      </button>

      <div className="cf-panel rounded-2xl p-5 sm:p-6 mb-6">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="cf-mono text-[11px] cf-gold font-semibold tracking-wide">
            {deck.style === "edhrec" ? "EDHREC-INSPIRED" : "RANDOM BUILD"}
          </span>
          <span className="text-white/30">·</span>
          <span className="cf-mono text-[11px] text-purple-300 font-semibold tracking-wide">
            BRACKET {deck.bracket.id} · {deck.bracket.name.toUpperCase()}
          </span>
        </div>
        <div className="flex items-start gap-4 flex-wrap">
          {priceSource !== "none" && <CommanderArt imageUrl={deck.commander.imageLarge} />}
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <h2 className="cf-display text-2xl sm:text-3xl text-white break-words">{deck.commander.name}</h2>
                <p className="text-sm text-white/55 mt-1.5">{deck.commander.blurb}</p>
              </div>
              <ColorPips identity={deck.commander.identity} />
            </div>
            {priceSource !== "none" && (
              <p className="text-xs text-white/45 leading-relaxed whitespace-pre-line mt-2.5">
                {cardDataStatus === "loading"
                  ? "Loading card text…"
                  : cardData[deck.commander.name.toLowerCase()]?.oracleText || "Card text unavailable."}
              </p>
            )}
          </div>
        </div>

        <p className="text-sm text-white/70 leading-relaxed mt-4 pt-4 border-t border-white/10">
          {describeDeck(deck)}
        </p>

        {priceSource !== "none" && (
          <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
            <span className="text-xs text-white/50">
              Estimated deck total, commander included ({priceSource === "eur" ? "Cardmarket" : "TCGPlayer"})
            </span>
            {cardDataStatus === "loading" ? (
              <span className="flex items-center gap-1.5 text-xs text-white/50">
                <Loader2 size={12} className="animate-spin" /> Fetching prices…
              </span>
            ) : cardDataStatus === "error" ? (
              <span className="text-xs text-red-300/80">Price data unavailable</span>
            ) : (
              <span className="cf-mono text-sm cf-gold font-semibold">
                {deckTotalPrice() != null ? formatPrice(deckTotalPrice(), priceSource) : "—"}
              </span>
            )}
          </div>
        )}

        {priceSource !== "none" && cardDataStatus === "done" && deck.budgetTarget != null && deckTotalPrice() != null && (
          <p className={`text-xs mt-2 text-right ${deckTotalPrice() <= deck.budgetTarget ? "text-green-400/80" : "text-amber-400/80"}`}>
            {deckTotalPrice() <= deck.budgetTarget
              ? `Under your ${formatPrice(deck.budgetTarget, priceSource)} budget by ${formatPrice(deck.budgetTarget - deckTotalPrice(), priceSource)}`
              : `${formatPrice(deckTotalPrice() - deck.budgetTarget, priceSource)} over your ${formatPrice(deck.budgetTarget, priceSource)} budget — ${(priceOf(deck.commander.name, cardData, priceSource) ?? 0) >= deck.budgetTarget ? "the commander alone costs more than the budget, so the rest was built as cheaply as possible" : "not enough cheap eligible cards to fit every slot"}`}
          </p>
        )}
      </div>

      {cardDataStatus === "done" && deck.shortfall > 0 && (
        <div className="cf-panel rounded-xl p-4 mb-4 border-amber-400/30">
          <p className="text-xs text-white/60 leading-relaxed">
            Scryfall didn't return enough cards to fill {deck.shortfall} spell slot{deck.shortfall === 1 ? "" : "s"}, so {deck.shortfall === 1 ? "an extra basic land was" : `${deck.shortfall} extra basic lands were`} added instead. That happens when a narrow theme or colour combination has few matching cards, or when Scryfall was briefly busy, in which case forging again usually fixes it.
          </p>
        </div>
      )}

      {cardDataStatus === "error" && (
        <div className="cf-panel rounded-xl p-4 mb-4 border-red-400/30">
          <p className="text-xs text-white/60 leading-relaxed">
            Couldn't reach Scryfall to source this deck's cards — every category and land now pulls live from their API, so this needs a working connection. Check your internet connection and try forging again. If some categories partially loaded, you may see a lighter deck below with extra basic lands filling the gap.
          </p>
        </div>
      )}

      <div className="space-y-3 mb-6">
        {Object.entries(deck.picks).map(([cat, cards]) =>
          cards.length ? (
            <div key={cat} className="cf-panel-alt rounded-xl p-4">
              <p className="cf-mono text-[11px] cf-gold font-semibold mb-2.5 tracking-wide">
                {CAT_LABELS[cat].toUpperCase()} · {cards.length}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                {cards.map((c) => (
                  <CardRow
                    key={c.name}
                    name={c.name}
                    qty={1}
                    cardData={cardData}
                    priceSource={priceSource}
                    onPreview={setPreviewCard}
                  />
                ))}
              </div>
            </div>
          ) : null
        )}

        <div className="cf-panel-alt rounded-xl p-4">
          <p className="cf-mono text-[11px] cf-gold font-semibold mb-2.5 tracking-wide">
            LANDS · {deck.nonbasics.reduce((a, l) => a + l.qty, 0) + deck.basics.reduce((a, l) => a + l.qty, 0)}
          </p>
          {priceSource !== "none" && deck.basics.length > 0 && (
            <p className="text-xs text-white/50 mb-2.5">
              Basic lands aren't priced or counted in the deck total or budget. They cost pennies each, and most players already have plenty.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
            {[...deck.nonbasics, ...deck.basics].map((l) => (
              <CardRow
                key={l.name}
                name={l.name}
                qty={l.qty}
                cardData={cardData}
                priceSource={priceSource}
                onPreview={setPreviewCard}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Kept well clear of the buttons below so nobody taps an ad by mistake,
          which AdSense treats as invalid clicks. */}
      <AdSlot className="mb-8" />

      <div className="flex flex-col sm:flex-row gap-3 mb-3">
        <button
          onClick={() => {
            if (session) {
              setSaveModalOpen(true);
            } else {
              openAuthModal("Sign in (or create a free account) to save this deck.");
            }
          }}
          className="flex-1 py-3.5 rounded-xl border-2 border-[#E3B25C]/70 bg-[#E3B25C]/15 hover:bg-[#E3B25C]/25 transition text-white font-semibold text-sm flex items-center justify-center gap-2"
        >
          <Save size={15} /> {session ? "Save Deck" : "Sign In to Save"}
        </button>
        <button
          onClick={reset}
          className="flex-1 py-3.5 rounded-xl border-2 border-white/25 bg-white/5 hover:bg-white/10 transition text-white/85 font-semibold text-sm flex items-center justify-center gap-2"
        >
          Forge Another
        </button>
      </div>

      <button
        onClick={() => copyForCardmarket(deck.commander.name, deck.picks, deck.nonbasics)}
        className="w-full py-3 rounded-xl border-2 border-white/15 bg-white/5 hover:bg-white/10 transition text-white/75 font-semibold text-sm flex items-center justify-center gap-2"
      >
        {cardmarketCopied ? (
          <>
            <Check size={15} className="text-green-400" /> Copied — paste straight into a Cardmarket Wants list
          </>
        ) : cardmarketCopyError ? (
          <>Couldn't copy — your browser may be blocking clipboard access</>
        ) : (
          <>
            <ClipboardCopy size={15} /> Copy for Cardmarket Wants List
          </>
        )}
      </button>
    </div>
  );
}
