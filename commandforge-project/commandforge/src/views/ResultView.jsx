import { useState } from "react";
import { Check, ChevronLeft, Lightbulb, Loader2, Pencil, Save, Swords } from "lucide-react";
import { CommanderArt } from "../components/CardImages";
import AdSlot from "../components/AdSlot";
import CardRow from "../components/CardRow";
import ExportButtons from "../components/ExportButtons";
import ColorPips from "../components/ColorPips";
import BracketCheck from "../components/BracketCheck";
import DeckStats from "../components/DeckStats";
import AddCardSearch from "../components/AddCardSearch";
import PriceSourcePicker from "../components/PriceSourcePicker";
import { formatPrice, priceOf } from "../lib/budget";
import { CAT_LABELS } from "../lib/buildDeck";
import { deckOverview, playstyleName, strategyBlurb } from "../lib/describeDeck";
import { DECK_SIZE, deckHas, deckSize } from "../lib/editDeck";
import { includeIssueText } from "../lib/cardLists";

// How many suggested additions to show for each role.
const SUGGESTIONS_SHOWN = 3;
const SUGGESTIONS_SHOWN_EDITING = 6;

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
  addSearchedCard,
  addToDeck,
  changePriceSource,
  evenOutDeck,
  loadSuggestedAdditions,
  openMyDecks,
  pricesRefreshing,
  removeFromDeck,
  savedNotice,
  suggestionsStatus,
  cardData,
  cardDataStatus,
  copied,
  copyDeck,
  copyError,
  deck,
  deckTotalPrice,
  openAuthModal,
  priceSource,
  reset,
  session,
  setPreviewCard,
  setSaveModalOpen,
}) {
  // A deck opened from My decks starts in editing, since that's what it
  // was opened for.
  const [editing, setEditing] = useState(Boolean(deck.savedId));
  const size = deckSize(deck);
  const inDeck = (name) => deckHas(deck, name);
  const suggestedRoles = Object.entries(deck.alternatives || {}).filter(([, names]) => names.length);

  return (
    <div className="cf-fade">
      <button onClick={reset} className="flex items-center gap-1 text-sm text-parchment/50 hover:text-parchment/80 mb-5 transition">
        <ChevronLeft size={16} /> Back
      </button>

      {savedNotice && (
        <div className="cf-panel rounded-xl px-4 py-3 mb-4 flex items-center justify-between gap-3 flex-wrap border-green-300/30" role="status">
          <p className="text-sm text-parchment/80 flex items-center gap-2">
            <Check size={15} className="text-green-400" /> Saved as &ldquo;{deck.savedName}&rdquo;. Find it any time under My decks.
          </p>
          <button onClick={openMyDecks} className="text-xs font-semibold cf-gold underline underline-offset-2">
            Open My decks
          </button>
        </div>
      )}

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
          {deck.savedId && (
            <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full border border-white/15 text-parchment/60 truncate max-w-full">
              Saved as {deck.savedName}
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

        {priceSource !== "none" && (
          <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
            <span className="text-xs text-parchment/50">
              Estimated deck total, commander included ({priceSource === "eur" ? "Cardmarket" : "TCGplayer"})
            </span>
            {cardDataStatus === "loading" || pricesRefreshing ? (
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

        {priceSource !== "none" && priceSource === deck.budgetSource && cardDataStatus === "done" && deck.budgetTarget != null && deckTotalPrice() != null && (
          <p className={`text-xs mt-2 text-right ${deckTotalPrice() <= deck.budgetTarget ? "text-green-400/80" : "text-amber-400/80"}`}>
            {deckTotalPrice() <= deck.budgetTarget
              ? `Under your ${formatPrice(deck.budgetTarget, priceSource)} budget by ${formatPrice(deck.budgetTarget - deckTotalPrice(), priceSource)}`
              : `${formatPrice(deckTotalPrice() - deck.budgetTarget, priceSource)} over your ${formatPrice(deck.budgetTarget, priceSource)} budget. ${(priceOf(deck.commander.name, cardData, priceSource) ?? 0) >= deck.budgetTarget ? "The commander alone costs more than that, so the rest was built as cheaply as possible." : deck.included?.length ? "Your must-include cards are kept whatever they cost." : "There weren't enough cheap cards that fit to fill every slot."}`}
          </p>
        )}
      </div>

      <div className="cf-panel rounded-2xl p-5 sm:p-6 mb-6 border-brass/30">
        <p className="cf-eyebrow mb-2 flex items-center gap-1.5">
          <Swords size={13} className="text-brass/80" /> How this deck plays
        </p>
        <h3 className="cf-display text-2xl text-parchment mb-2">{playstyleName(deck)}</h3>
        <p className="text-base text-parchment/85 leading-relaxed">{strategyBlurb(deck)}</p>
        <p className="text-xs text-parchment/50 leading-relaxed mt-3">{deckOverview(deck)}</p>
      </div>

      <div className="cf-panel rounded-xl p-4 mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-parchment/60 font-semibold mb-1.5 flex items-center gap-1.5">
            Card images and prices from
            {pricesRefreshing && <Loader2 size={12} className="animate-spin text-parchment/50" />}
          </p>
          <PriceSourcePicker compact priceSource={priceSource} setPriceSource={changePriceSource} />
        </div>
        <button
          onClick={() => setEditing((v) => !v)}
          aria-pressed={editing}
          className={`shrink-0 sm:self-end py-2.5 px-4 text-sm ${editing ? "cf-btn-secondary" : "cf-btn-quiet"}`}
        >
          {editing ? <Check size={14} /> : <Pencil size={14} />} {editing ? "Done editing" : "Edit deck"}
        </button>
      </div>

      {(deck.included?.length > 0 || deck.includeIssues?.length > 0 || deck.bannedCount > 0) && (
        <div className="cf-panel rounded-xl p-4 mb-4">
          <p className="text-xs text-parchment/60 leading-relaxed">
            {[
              deck.included?.length && `${deck.included.length} must-include card${deck.included.length === 1 ? "" : "s"} in the deck`,
              deck.bannedCount && `${deck.bannedCount} banned card${deck.bannedCount === 1 ? "" : "s"} kept out`,
            ].filter(Boolean).join(", ")}
            {(deck.included?.length || deck.bannedCount) ? "." : ""}
          </p>
          {deck.includeIssues?.length > 0 && (
            <>
              <p className="text-xs text-amber-200/90 mt-2">Left out of your must-include list:</p>
              <ul className="text-xs text-parchment/60 mt-1 space-y-0.5 list-disc pl-4">
                {deck.includeIssues.map((issue) => <li key={issue.name}>{includeIssueText(issue, deck.commander.name)}</li>)}
              </ul>
            </>
          )}
        </div>
      )}

      {(editing || size !== DECK_SIZE) && (
        <div className={`cf-panel rounded-xl p-4 mb-4 ${size !== DECK_SIZE ? "border-amber-400/30" : ""}`}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-parchment/80">
              <span className={`cf-mono font-semibold ${size === DECK_SIZE ? "text-green-400/90" : "text-amber-300"}`}>{size}</span>
              <span className="text-parchment/50"> of {DECK_SIZE} cards, plus your commander</span>
            </p>
            {size !== DECK_SIZE && (
              <button onClick={evenOutDeck} className="text-xs font-semibold cf-gold underline underline-offset-2">
                {size > DECK_SIZE ? `Cut ${size - DECK_SIZE} basic land${size - DECK_SIZE === 1 ? "" : "s"}` : `Add ${DECK_SIZE - size} basic land${DECK_SIZE - size === 1 ? "" : "s"}`}
              </button>
            )}
          </div>
          {size !== DECK_SIZE && (
            <p className="text-xs text-parchment/50 mt-1.5 leading-relaxed">
              {size > DECK_SIZE
                ? "Cut a card for each one you've added, or let Brewhall take out basic lands."
                : "Add a card for each one you've cut, or let Brewhall fill the gap with basic lands."}
            </p>
          )}
          {editing && (
            <div className="mt-4 pt-4 border-t border-white/10">
              <AddCardSearch identity={deck.commander.identity} inDeck={inDeck} onAdd={addSearchedCard} />
              <p className="text-xs text-parchment/45 mt-3">Tap the × beside a card to cut it, or tap a card for swaps.</p>
            </div>
          )}
        </div>
      )}

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

      {cardDataStatus === "done" && <BracketCheck bracket={deck.bracket} check={deck.bracketCheck} />}
      {cardDataStatus === "done" && <DeckStats picks={deck.picks} cardData={cardData} />}

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
                    onPreview={(card) =>
                      setPreviewCard({ ...card, inDeck: true, ...(deck.alternatives?.[cat]?.length ? { swapRole: cat } : {}) })
                    }
                    onRemove={editing ? () => removeFromDeck(c.name) : null}
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
                onPreview={(card) => setPreviewCard({ ...card, inDeck: true })}
                onRemove={editing ? () => removeFromDeck(l.name) : null}
              />
            ))}
          </div>
        </div>
      </div>

      {deck.fromCollection && Object.keys(deck.suggestions || {}).length > 0 && (
        <div className="cf-panel-alt rounded-xl p-4 mb-6">
          <h3 className="cf-display text-lg text-parchment mb-1">Worth picking up</h3>
          <p className="text-xs text-parchment/50 mb-3">Popular cards for this commander in the roles your collection is short on. Add one to put it in the deck, then cut a card to make room.</p>
          {Object.entries(deck.suggestions).map(([cat, names]) => (
            <div key={cat} className="mb-2 last:mb-0">
              <p className="cf-eyebrow mb-1">{CAT_LABELS[cat]}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                {names.map((name) => (
                  <CardRow
                    key={name}
                    name={name}
                    qty={1}
                    cardData={cardData}
                    priceSource={priceSource}
                    onPreview={(card) => setPreviewCard({ ...card, addRole: cat })}
                    onAdd={() => addToDeck(name, cat)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {(!deck.fromCollection || !Object.keys(deck.suggestions || {}).length) && (
        <div className="cf-panel-alt rounded-xl p-4 mb-6">
          <h3 className="cf-display text-lg text-parchment mb-1 flex items-center gap-2">
            <Lightbulb size={16} className="text-brass/70" /> Suggested additions
          </h3>
          <p className="text-xs text-parchment/50 mb-3">
            {suggestedRoles.length
              ? "The next-best cards for each job that didn't make the cut. Add one, then cut a card to make room, or tap a card in the deck to swap it straight over."
              : "Cards real decks with this commander run that this one doesn't, from EDHREC."}
          </p>
          {suggestedRoles.map(([cat, names]) => (
            <div key={cat} className="mb-2 last:mb-0">
              <p className="cf-eyebrow mb-1">{CAT_LABELS[cat] || "Lands"}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                {names.slice(0, editing ? SUGGESTIONS_SHOWN_EDITING : SUGGESTIONS_SHOWN).map((name) => (
                  <CardRow
                    key={name}
                    name={name}
                    qty={1}
                    cardData={cardData}
                    priceSource={priceSource}
                    onPreview={(card) => setPreviewCard({ ...card, addRole: cat })}
                    onAdd={() => addToDeck(name, cat)}
                  />
                ))}
              </div>
            </div>
          ))}
          {!suggestedRoles.length && (
            <button
              onClick={loadSuggestedAdditions}
              disabled={suggestionsStatus === "loading"}
              className="cf-btn-quiet py-2.5 px-4 text-sm"
            >
              {suggestionsStatus === "loading" && <Loader2 size={14} className="animate-spin" />}
              {suggestionsStatus === "loading" ? "Finding cards…" : "Find suggestions"}
            </button>
          )}
          {suggestionsStatus === "error" && <p className="text-xs text-red-300/80 mt-2">Couldn&apos;t reach EDHREC or Scryfall. Try again in a moment.</p>}
          {suggestionsStatus === "done" && !suggestedRoles.length && <p className="text-xs text-parchment/50 mt-2">This deck already has every popular card for its commander.</p>}
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
          <Save size={15} /> {!session ? "Sign in to save" : deck.savedId ? "Save changes" : "Save deck"}
        </button>
        <button
          onClick={reset}
          className="flex-1 py-3.5 cf-btn-quiet"
        >
          Brew another
        </button>
      </div>

      <div className="cf-panel rounded-2xl p-4 sm:p-5 mt-3">
        <ExportButtons
          copied={copied}
          copyDeck={copyDeck}
          copyError={copyError}
          deck={deck}
          needed={deck.fromCollection ? neededCount(deck) + suggestionCount(deck) : null}
        />
      </div>
    </div>
  );
}
