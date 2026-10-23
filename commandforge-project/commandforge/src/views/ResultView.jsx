import { Check, ChevronLeft, ClipboardCopy, Loader2, Save } from "lucide-react";
import { CommanderArt } from "../components/CardImages";
import AdSlot from "../components/AdSlot";
import CardRow from "../components/CardRow";
import ColorPips from "../components/ColorPips";
import { formatPrice, priceOf } from "../lib/budget";
import { CAT_LABELS } from "../lib/buildDeck";
import { describeDeck } from "../lib/describeDeck";

// Cards in a collection build the person doesn't own yet.
function neededCount(deck) {
  return Object.values(deck.picks).flat().filter((c) => c.missing).length + (deck.commanderOwned ? 0 : 1);
}

function suggestionCount(deck) {
  return Object.values(deck.suggestions || {}).flat().length;
}

function CategoryHeading({ label, count }) {
  return (
    <div className="flex items-baseline justify-between gap-3 mb-2 pb-1.5 border-b border-white/[0.06]">
      <h3 className="cf-display text-base text-parchment">{label}</h3>
      <span className="cf-mono text-xs text-brass/70">{count}</span>
    </div>
  );
}

export default function ResultView({
  cardData,
  cardDataStatus,
  cardmarketCopied,
  cardmarketCopyError,
  copyForCardmarket,
  copyNeededForCardmarket,
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
      <button onClick={reset} className="flex items-center gap-1 text-sm text-parchment/50 hover:text-parchment/80 mb-5 transition">
        <ChevronLeft size={16} /> Back
      </button>

      <div className="cf-panel rounded-2xl p-5 sm:p-6 mb-6">
        <div className="flex flex-wrap items-center gap-1.5 mb-4">
          <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full border border-brass/40 text-brass">
            Bracket {deck.bracket.id} · {deck.bracket.name}
          </span>
          <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full border border-white/15 text-parchment/60">
            {deck.style === "edhrec" ? "Inspired by real decks" : "Random build"}
          </span>
          {deck.fromCollection && (
            <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full border border-green-300/30 text-green-300/90">
              From your collection
            </span>
          )}
        </div>
        <div className="flex items-start gap-4 flex-wrap">
          {priceSource !== "none" && <CommanderArt imageUrl={deck.commander.imageLarge} />}
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <h2 className="cf-display text-2xl sm:text-3xl text-parchment break-words">{deck.commander.name}</h2>
                <p className="text-sm text-parchment/55 mt-1.5">{deck.commander.blurb}</p>
              </div>
              <ColorPips identity={deck.commander.identity} />
            </div>
            {priceSource !== "none" && (
              <p className="text-xs text-parchment/45 leading-relaxed whitespace-pre-line mt-2.5">
                {cardDataStatus === "loading"
                  ? "Loading card text…"
                  : cardData[deck.commander.name.toLowerCase()]?.oracleText || "Card text unavailable."}
              </p>
            )}
          </div>
        </div>

        <p className="text-sm text-parchment/70 leading-relaxed mt-4 pt-4 border-t border-white/10">
          {describeDeck(deck)}
        </p>

        {priceSource !== "none" && (
          <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
            <span className="text-xs text-parchment/50">
              Estimated deck total, commander included ({priceSource === "eur" ? "Cardmarket" : "TCGplayer"})
            </span>
            {cardDataStatus === "loading" ? (
              <span className="flex items-center gap-1.5 text-xs text-parchment/50">
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
              : `${formatPrice(deckTotalPrice() - deck.budgetTarget, priceSource)} over your ${formatPrice(deck.budgetTarget, priceSource)} budget. ${(priceOf(deck.commander.name, cardData, priceSource) ?? 0) >= deck.budgetTarget ? "The commander alone costs more than that, so the rest was built as cheaply as possible." : "There weren't enough cheap cards that fit to fill every slot."}`}
          </p>
        )}
      </div>

      {cardDataStatus === "done" && deck.fromCollection && (
        <div className="cf-panel rounded-xl p-4 mb-4">
          <p className="text-xs text-parchment/60 leading-relaxed">
            {neededCount(deck) === 0
              ? "Every card in this deck is one you own (basic lands aside)."
              : `${neededCount(deck)} card${neededCount(deck) === 1 ? " isn't" : "s aren't"} in your collection${!deck.commanderOwned ? ", the commander included" : ""}. ${deck.missingCount ? "Your collection didn't have enough cards in these colors to fill the deck, so the best picks you'd need to buy are marked NEED." : ""}`}
          </p>
          {Object.keys(deck.shortRoles || {}).length > 0 && (
            <p className="text-xs text-parchment/60 leading-relaxed mt-2">
              Your collection is light on{" "}
              {Object.entries(deck.shortRoles)
                .map(([cat, r]) => `${CAT_LABELS[cat].toLowerCase()} (${r.have} of ${r.want})`)
                .join(", ")}
              {deck.missingCount ? "." : ", so other cards you own fill those slots."}
            </p>
          )}
        </div>
      )}

      {cardDataStatus === "done" && deck.shortfall > 0 && (
        <div className="cf-panel rounded-xl p-4 mb-4 border-amber-400/30">
          <p className="text-xs text-parchment/60 leading-relaxed">
            Scryfall didn't return enough cards to fill {deck.shortfall} spell slot{deck.shortfall === 1 ? "" : "s"}, so {deck.shortfall === 1 ? "an extra basic land was" : `${deck.shortfall} extra basic lands were`} added instead. That happens when a narrow theme or colour combination has few matching cards, or when Scryfall was briefly busy, in which case brewing again usually fixes it.
          </p>
        </div>
      )}

      {cardDataStatus === "error" && (
        <div className="cf-panel rounded-xl p-4 mb-4 border-red-400/30">
          <p className="text-xs text-parchment/60 leading-relaxed">
            Couldn't reach Scryfall to fetch this deck's cards. Every card comes live from Scryfall, so Brewhall needs a working connection. Check your internet and try brewing again. If some of it loaded, you may see a lighter deck below with extra basic lands filling the gaps.
          </p>
        </div>
      )}

      <div className="space-y-3 mb-6">
        {Object.entries(deck.picks).map(([cat, cards]) =>
          cards.length ? (
            <div key={cat} className="cf-panel-alt rounded-xl p-4">
              <CategoryHeading label={CAT_LABELS[cat]} count={cards.length} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                {cards.map((c) => (
                  <CardRow
                    key={c.name}
                    name={c.name}
                    missing={c.missing}
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
          <CategoryHeading
            label="Lands"
            count={deck.nonbasics.reduce((a, l) => a + l.qty, 0) + deck.basics.reduce((a, l) => a + l.qty, 0)}
          />
          {priceSource !== "none" && deck.basics.length > 0 && (
            <p className="text-xs text-parchment/50 mb-2.5">
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

      {deck.fromCollection && Object.keys(deck.suggestions || {}).length > 0 && (
        <div className="cf-panel-alt rounded-xl p-4 mb-6">
          <h3 className="cf-display text-lg text-parchment mb-1">Worth picking up</h3>
          <p className="text-xs text-parchment/50 mb-3">Popular cards for this commander in the roles your collection is short on.</p>
          {Object.entries(deck.suggestions).map(([cat, names]) => (
            <div key={cat} className="mb-2 last:mb-0">
              <p className="cf-eyebrow mb-1">{CAT_LABELS[cat]}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                {names.map((name) => (
                  <CardRow key={name} name={name} qty={1} cardData={cardData} priceSource={priceSource} onPreview={setPreviewCard} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Kept well clear of the buttons below so nobody taps an ad by mistake,
          which AdSense treats as invalid clicks. */}
      <AdSlot className="mb-8" />

      <div className="flex flex-col sm:flex-row gap-3 mb-3">
        <button
          onClick={() => {
            if (session) {
              setSaveModalOpen(true);
            } else {
              openAuthModal("Sign in, or create a free account, to save this deck.");
            }
          }}
          className="flex-1 py-3.5 cf-btn-primary"
        >
          <Save size={15} /> {session ? "Save deck" : "Sign in to save"}
        </button>
        <button
          onClick={reset}
          className="flex-1 py-3.5 cf-btn-quiet"
        >
          Brew another
        </button>
      </div>

      <button
        onClick={() =>
          deck.fromCollection
            ? copyNeededForCardmarket(deck)
            : copyForCardmarket(deck.commander.name, deck.picks, deck.nonbasics)
        }
        disabled={deck.fromCollection && neededCount(deck) + suggestionCount(deck) === 0}
        className="w-full py-3 cf-btn-quiet"
      >
        {cardmarketCopied ? (
          <>
            <Check size={15} className="text-green-400" /> Copied. Paste it straight into a Cardmarket wants list.
          </>
        ) : cardmarketCopyError ? (
          <>Couldn't copy. Your browser may be blocking clipboard access.</>
        ) : (
          <>
            <ClipboardCopy size={15} /> {deck.fromCollection ? "Copy the cards you need for Cardmarket" : "Copy for a Cardmarket wants list"}
          </>
        )}
      </button>
    </div>
  );
}
