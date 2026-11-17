import { useMemo, useState } from "react";
import { Library, Loader2, Minus, Plus, Search, Sparkles, Trash2, Upload, User } from "lucide-react";

const PAGE_SIZE = 50;

export default function CollectionView({
  clearCollection,
  collection,
  collectionError,
  collectionStatus,
  commanderCount,
  importCollection,
  importError,
  importProgress,
  importing,
  notFound,
  openAuthModal,
  ownedCards,
  session,
  setCardQty,
  startCollectionBuild,
}) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [filter, setFilter] = useState("");
  const [shown, setShown] = useState(PAGE_SIZE);
  const [removed, setRemoved] = useState(null);
  const totalCards = collection.reduce((s, e) => s + e.qty, 0);

  const matching = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? collection.filter((e) => e.name.toLowerCase().includes(q)) : collection;
  }, [collection, filter]);

  function changeQty(entry, qty) {
    if (qty < 1) setRemoved({ name: entry.name, qty: entry.qty });
    else if (removed?.name === entry.name) setRemoved(null);
    setCardQty(entry.name, qty);
  }

  function undoRemove() {
    if (!removed) return;
    const { name, qty } = removed;
    setRemoved(null);
    setCardQty(name, qty);
  }

  async function readFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setText(await file.text());
    e.target.value = "";
  }

  async function submit(mode) {
    if (!text.trim() || importing) return;
    const ok = await importCollection(text, mode);
    if (ok) {
      setText("");
      setFileName("");
    }
  }

  return (
    <div className="cf-fade">
      <h1 className="cf-display text-3xl text-parchment mb-1.5">My collection</h1>
      <p className="text-xs text-parchment/40 mb-6">
        {session
          ? "Saved to your account, so it's there on any device you sign in on."
          : "Saved in this browser only. Sign in to keep it on your account."}
        {!session && (
          <button onClick={() => openAuthModal("Sign in to save your collection to your account.")} className="ml-1.5 cf-gold underline underline-offset-2 inline-flex items-center gap-1">
            <User size={11} /> Sign in
          </button>
        )}
      </p>

      <div className="cf-panel rounded-2xl p-5 sm:p-6 mb-5">
        {collectionStatus === "loading" ? (
          <p className="text-sm text-parchment/50 flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" /> Loading your collection…
          </p>
        ) : collection.length === 0 ? (
          <p className="text-sm text-parchment/50">Your collection is empty. Import it below to build decks from cards you own.</p>
        ) : (
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-parchment">
                {totalCards.toLocaleString()} cards · {collection.length.toLocaleString()} different
              </p>
              <p className="text-xs text-parchment/50 mt-0.5">
                {collectionStatus === "ready"
                  ? `${commanderCount} possible commander${commanderCount === 1 ? "" : "s"}`
                  : collectionStatus === "error"
                  ? "Couldn't look the cards up on Scryfall. Check your connection."
                  : "Looking the cards up on Scryfall…"}
              </p>
            </div>
            <button
              onClick={startCollectionBuild}
              disabled={collectionStatus !== "ready"}
              className="px-4 py-2.5 cf-btn-primary"
            >
              <Sparkles size={14} /> Build a deck from it
            </button>
          </div>
        )}
        {collectionError && <p className="text-xs text-red-300/80 mt-3">{collectionError}</p>}
      </div>

      {collection.length > 0 && (
        <div className="cf-panel rounded-2xl p-5 sm:p-6 mb-5">
          <h2 className="cf-display text-lg text-parchment mb-3">Your cards</h2>
          {collection.length > 10 && (
            <div className="relative mb-3">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-parchment/40 pointer-events-none" />
              <input
                type="search"
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setShown(PAGE_SIZE);
                }}
                placeholder="Find a card"
                aria-label="Find a card in your collection"
                className="cf-field py-2.5 pl-9"
              />
            </div>
          )}
          {removed && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-parchment/70" role="status">
              <span className="min-w-0 truncate">Removed {removed.name}</span>
              <button onClick={undoRemove} className="cf-gold font-semibold underline underline-offset-2 shrink-0">Undo</button>
            </div>
          )}
          {matching.length === 0 ? (
            <p className="text-sm text-parchment/50">No cards match “{filter.trim()}”.</p>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {matching.slice(0, shown).map((entry) => {
                const type = ownedCards[entry.name.toLowerCase()]?.type_line;
                return (
                  <li key={entry.name} className="flex items-center gap-2 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-parchment truncate">{entry.name}</p>
                      {type && <p className="text-[11px] text-parchment/40 truncate">{type}</p>}
                    </div>
                    <div className="flex items-center shrink-0">
                      <button
                        onClick={() => changeQty(entry, entry.qty - 1)}
                        aria-label={entry.qty === 1 ? `Remove ${entry.name}` : `One fewer ${entry.name}`}
                        className="w-9 h-9 flex items-center justify-center rounded-lg text-parchment/60 hover:text-parchment hover:bg-white/[0.06]"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-8 text-center text-sm cf-mono text-parchment/90" aria-label={`${entry.qty} owned`}>{entry.qty}</span>
                      <button
                        onClick={() => changeQty(entry, entry.qty + 1)}
                        aria-label={`One more ${entry.name}`}
                        className="w-9 h-9 flex items-center justify-center rounded-lg text-parchment/60 hover:text-parchment hover:bg-white/[0.06]"
                      >
                        <Plus size={14} />
                      </button>
                      <button
                        onClick={() => changeQty(entry, 0)}
                        aria-label={`Remove ${entry.name}`}
                        className="ml-1 w-9 h-9 flex items-center justify-center rounded-lg text-red-300/70 hover:text-red-300 hover:bg-red-500/10"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {matching.length > shown && (
            <button onClick={() => setShown((n) => n + PAGE_SIZE * 4)} className="w-full mt-3 py-2.5 cf-btn-quiet">
              Show more ({(matching.length - shown).toLocaleString()} left)
            </button>
          )}
        </div>
      )}

      <div className="cf-panel rounded-2xl p-5 sm:p-6 mb-5">
        <h2 className="cf-display text-lg text-parchment mb-2">Import cards</h2>
        <p className="text-xs text-parchment/50 leading-relaxed mb-4">
          From <span className="text-parchment/80 font-semibold">ManaBox</span>, export your collection (or a binder) as a CSV file and choose it here.
          CSV exports from Moxfield and similar sites work too. Or paste a list with one card per line, such as <span className="cf-mono text-parchment/70">1 Sol Ring</span>.
        </p>
        <label className="w-full mb-3 py-3 rounded-xl border-2 border-dashed border-white/20 hover:border-white/35 transition text-parchment/70 text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer">
          <Upload size={15} /> {fileName || "Choose a CSV or text file"}
          <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={readFile} className="hidden" />
        </label>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setFileName("");
          }}
          rows={7}
          placeholder={"1 Sol Ring\n1 Arcane Signet\n4 Island\nCultivate"}
          className="cf-field py-2.5 cf-mono"
        />
        <div className="flex flex-col sm:flex-row gap-2 mt-3">
          <button
            onClick={() => submit("add")}
            disabled={!text.trim() || importing}
            className="flex-1 py-3 cf-btn-secondary"
          >
            {importing ? <Loader2 size={15} className="animate-spin" /> : <Library size={15} />}
            {importing
              ? importProgress ? `Checking cards… ${importProgress.done} of ${importProgress.total}` : "Checking cards…"
              : "Add to collection"}
          </button>
          {collection.length > 0 && (
            <button
              onClick={() => {
                if (window.confirm("Replace your whole collection with this list?")) submit("replace");
              }}
              disabled={!text.trim() || importing}
              className="sm:w-48 py-3 cf-btn-quiet"
            >
              Replace collection
            </button>
          )}
        </div>
        {importError && <p className="text-xs text-red-300/80 mt-3">{importError}</p>}
        {notFound.length > 0 && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <p className="text-xs text-amber-400/80 mb-1.5">
              Scryfall didn't recognise {notFound.length} name{notFound.length === 1 ? "" : "s"}, so {notFound.length === 1 ? "it was" : "they were"} left out:
            </p>
            <p className="text-xs text-parchment/50 leading-relaxed break-words">{notFound.slice(0, 40).join(", ")}{notFound.length > 40 ? `, and ${notFound.length - 40} more` : ""}</p>
          </div>
        )}
      </div>

      {collection.length > 0 && (
        <button
          onClick={() => {
            if (window.confirm("Remove every card from your collection? This can't be undone.")) clearCollection();
          }}
          className="inline-flex items-center gap-2 px-4 py-2 cf-btn-danger text-xs"
        >
          <Trash2 size={13} /> Clear collection
        </button>
      )}
    </div>
  );
}
