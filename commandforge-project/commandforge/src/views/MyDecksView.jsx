import { Check, ClipboardCopy, Loader2, Trash2, User } from "lucide-react";
import CardRow from "../components/CardRow";
import ColorPips from "../components/ColorPips";
import { CAT_LABELS } from "../lib/buildDeck";

export default function MyDecksView({
  accountDeleteError,
  accountDeleting,
  cardmarketCopied,
  copyForCardmarket,
  decksLoading,
  deleteAccount,
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
      <h1 className="cf-display text-3xl text-parchment mb-1.5">My decks</h1>
      <p className="text-xs text-parchment/40 mb-6">
        {session
          ? "Saved to your account, so they're on any device you sign in on."
          : "Sign in to keep your decks and open them anywhere."}
      </p>

      {!session && (
        <div className="cf-panel rounded-2xl p-10 text-center border-dashed mb-4">
          <p className="text-parchment/50 text-sm mb-4">Sign in, or create a free account, to save decks and find them again on any device.</p>
          <button
            onClick={() => openAuthModal()}
            className="inline-flex items-center gap-2 px-5 py-2.5 cf-btn-primary"
          >
            <User size={15} /> Sign in or sign up
          </button>
        </div>
      )}

      {session && decksLoading && (
        <p className="text-xs text-parchment/40 mb-4 flex items-center gap-1.5">
          <Loader2 size={12} className="animate-spin" /> Loading your decks…
        </p>
      )}

      {session && !decksLoading && savedDecks.length === 0 && (
        <div className="cf-panel rounded-2xl p-10 text-center border-dashed">
          <p className="text-parchment/50 text-sm">No decks saved yet. Brew one you like and press "Save deck".</p>
        </div>
      )}

      <div className="space-y-3">
        {savedDecks.map((d) => (
          <div key={d.id} className="cf-panel rounded-xl p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-parchment break-words">{d.deckName}</p>
                <p className="text-xs text-parchment/50 mt-0.5">
                  {d.commander} · {d.source === "collection" ? "From collection" : d.source === "edhrec_inspired" ? "Inspired by real decks" : "Random"} · {d.bracketName}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <ColorPips identity={d.identity} size="sm" />
                <button
                  onClick={() => setViewingSaved(viewingSaved?.id === d.id ? null : d)}
                  className="py-2 px-1 text-xs font-semibold cf-gold hover:text-parchment underline underline-offset-2"
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
                      <p className="cf-eyebrow mb-1">
                        {CAT_LABELS[cat]} <span className="cf-mono text-[11px] text-brass/60">{cards.length}</span>
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                        {cards.map((c) => (
                          <CardRow
                            key={c.name}
                            name={c.name}
                            missing={c.missing}
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
                  <p className="cf-eyebrow mb-1">Lands</p>
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
                  className="w-full py-2.5 cf-btn-quiet"
                >
                  {cardmarketCopied ? (
                    <>
                      <Check size={13} className="text-green-400" /> Copied
                    </>
                  ) : (
                    <>
                      <ClipboardCopy size={13} /> Copy for a Cardmarket wants list
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {session && (
        <div className="mt-10 pt-6 border-t border-white/10">
          <p className="text-xs text-parchment/40 mb-3">Signed in as {session.user.email}</p>
          <button
            onClick={() => {
              if (
                window.confirm(
                  `Delete your account (${session.user.email}) and all your saved decks? This can't be undone.`
                )
              )
                deleteAccount();
            }}
            disabled={accountDeleting}
            className="inline-flex items-center gap-2 px-4 py-2 cf-btn-danger text-xs"
          >
            {accountDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            Delete my account
          </button>
          {accountDeleteError && <p className="text-xs text-red-300/80 mt-2">{accountDeleteError}</p>}
        </div>
      )}
    </div>
  );
}
