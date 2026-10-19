import { Check, ClipboardCopy, Loader2, User } from "lucide-react";
import CardRow from "../components/CardRow";
import ColorPips from "../components/ColorPips";
import { CAT_LABELS } from "../lib/buildDeck";

export default function MyDecksView({
  cardmarketCopied,
  copyForCardmarket,
  decksLoading,
  deleteDeck,
  openAuthModal,
  savedDecks,
  session,
  setPreviewCard,
  setViewingSaved,
  viewingSaved,
}) {
  return (
    <div className="cf-fade">
      <h1 className="cf-display text-3xl text-white mb-1.5">My Decks</h1>
      <p className="text-xs text-white/40 mb-6">
        {session
          ? "Synced to your account — available on any device you sign in on."
          : "Sign in to save decks to your account and access them anywhere."}
      </p>

      {!session && (
        <div className="cf-panel rounded-2xl p-10 text-center border-dashed mb-4">
          <p className="text-white/50 text-sm mb-4">Sign in or create a free account to save and sync decks.</p>
          <button
            onClick={() => openAuthModal()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 border-[#E3B25C]/70 bg-[#E3B25C]/15 hover:bg-[#E3B25C]/25 transition text-white font-semibold text-sm"
          >
            <User size={15} /> Sign In / Sign Up
          </button>
        </div>
      )}

      {session && decksLoading && (
        <p className="text-xs text-white/40 mb-4 flex items-center gap-1.5">
          <Loader2 size={12} className="animate-spin" /> Loading your decks…
        </p>
      )}

      {session && !decksLoading && savedDecks.length === 0 && (
        <div className="cf-panel rounded-2xl p-10 text-center border-dashed">
          <p className="text-white/50 text-sm">No decks saved yet. Forge one and hit "Save Deck".</p>
        </div>
      )}

      <div className="space-y-3">
        {savedDecks.map((d) => (
          <div key={d.id} className="cf-panel rounded-xl p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white break-words">{d.deckName}</p>
                <p className="text-xs text-white/50 mt-0.5">
                  {d.commander} · {d.source === "edhrec_inspired" ? "EDHREC-inspired" : "Random"} · {d.bracketName}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <ColorPips identity={d.identity} size="sm" />
                <button
                  onClick={() => setViewingSaved(viewingSaved?.id === d.id ? null : d)}
                  className="py-2 px-1 text-xs font-semibold cf-gold hover:text-white underline underline-offset-2"
                >
                  {viewingSaved?.id === d.id ? "Hide" : "View"}
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`Delete "${d.deckName}"? This can't be undone.`)) deleteDeck(d.id);
                  }}
                  className="py-2 px-1 text-xs font-semibold text-red-400/80 hover:text-red-300 underline underline-offset-2"
                >
                  Delete
                </button>
              </div>
            </div>

            {viewingSaved?.id === d.id && (
              <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
                {Object.entries(d.picks).map(([cat, cards]) =>
                  cards.length ? (
                    <div key={cat}>
                      <p className="cf-mono text-[10px] cf-gold font-semibold mb-1.5 tracking-wide">
                        {CAT_LABELS[cat].toUpperCase()} · {cards.length}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                        {cards.map((c) => (
                          <CardRow
                            key={c.name}
                            name={c.name}
                            qty={1}
                            cardData={d.cardData || {}}
                            priceSource={d.priceSource || "none"}
                            onPreview={setPreviewCard}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null
                )}
                <div>
                  <p className="cf-mono text-[10px] cf-gold font-semibold mb-1.5 tracking-wide">LANDS</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                    {[...d.nonbasics, ...d.basics].map((l) => (
                      <CardRow
                        key={l.name}
                        name={l.name}
                        qty={l.qty}
                        cardData={d.cardData || {}}
                        priceSource={d.priceSource || "none"}
                        onPreview={setPreviewCard}
                      />
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => copyForCardmarket(d.commander, d.picks, d.nonbasics)}
                  className="w-full py-2.5 rounded-xl border-2 border-white/15 bg-white/5 hover:bg-white/10 transition text-white/75 font-semibold text-xs flex items-center justify-center gap-2"
                >
                  {cardmarketCopied ? (
                    <>
                      <Check size={13} className="text-green-400" /> Copied
                    </>
                  ) : (
                    <>
                      <ClipboardCopy size={13} /> Copy for Cardmarket Wants List
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
