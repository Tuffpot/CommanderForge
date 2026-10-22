import { useState } from "react";
import { Library, Loader2, Sparkles, Trash2, Upload, User } from "lucide-react";

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
  session,
  startCollectionBuild,
}) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const totalCards = collection.reduce((s, e) => s + e.qty, 0);

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
      <h1 className="cf-display text-3xl text-white mb-1.5">My Collection</h1>
      <p className="text-xs text-white/40 mb-6">
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
          <p className="text-sm text-white/50 flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" /> Loading your collection…
          </p>
        ) : collection.length === 0 ? (
          <p className="text-sm text-white/50">Your collection is empty. Import it below to build decks from cards you own.</p>
        ) : (
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-white">
                {totalCards.toLocaleString()} cards · {collection.length.toLocaleString()} different
              </p>
              <p className="text-xs text-white/50 mt-0.5">
                {collectionStatus === "ready"
                  ? `${commanderCount} possible commander${commanderCount === 1 ? "" : "s"}`
                  : collectionStatus === "error"
                  ? "Couldn't look the cards up on Scryfall — check your connection."
                  : "Looking the cards up on Scryfall…"}
              </p>
            </div>
            <button
              onClick={startCollectionBuild}
              disabled={collectionStatus !== "ready"}
              className="px-4 py-2.5 rounded-xl border-2 border-[#E3B25C]/70 bg-[#E3B25C]/15 hover:bg-[#E3B25C]/25 disabled:opacity-40 transition text-white font-semibold text-sm flex items-center gap-2"
            >
              <Sparkles size={14} /> Build a deck from it
            </button>
          </div>
        )}
        {collectionError && <p className="text-xs text-red-300/80 mt-3">{collectionError}</p>}
      </div>

      <div className="cf-panel rounded-2xl p-5 sm:p-6 mb-5">
        <p className="text-xs text-white/50 mb-3 tracking-widest font-semibold uppercase">Import cards</p>
        <p className="text-xs text-white/50 leading-relaxed mb-4">
          From <span className="text-white/80 font-semibold">ManaBox</span>, export your collection (or a binder) as a CSV file and choose it here.
          CSV exports from Moxfield and similar sites work too. Or paste a list with one card per line, such as <span className="cf-mono text-white/70">1 Sol Ring</span>.
        </p>
        <label className="w-full mb-3 py-3 rounded-xl border-2 border-dashed border-white/20 hover:border-white/35 transition text-white/70 text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer">
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
          className="w-full bg-black/40 border border-white/15 rounded-xl px-3 py-3 text-base sm:text-sm text-white placeholder-white/30 outline-none focus:border-[#E3B25C]/60 cf-mono"
        />
        <div className="flex flex-col sm:flex-row gap-2 mt-3">
          <button
            onClick={() => submit("add")}
            disabled={!text.trim() || importing}
            className="flex-1 py-3 rounded-xl border-2 border-purple-400/60 bg-purple-500/15 hover:bg-purple-500/25 disabled:border-white/15 disabled:bg-white/5 disabled:text-white/25 transition text-white font-semibold text-sm flex items-center justify-center gap-2"
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
              className="sm:w-48 py-3 rounded-xl border-2 border-white/15 bg-white/5 hover:bg-white/10 disabled:text-white/25 transition text-white/75 font-semibold text-sm"
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
            <p className="text-xs text-white/50 leading-relaxed break-words">{notFound.slice(0, 40).join(", ")}{notFound.length > 40 ? `, and ${notFound.length - 40} more` : ""}</p>
          </div>
        )}
      </div>

      {collection.length > 0 && (
        <button
          onClick={() => {
            if (window.confirm("Remove every card from your collection? This can't be undone.")) clearCollection();
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-red-400/40 text-red-300/90 hover:bg-red-500/10 transition text-xs font-semibold"
        >
          <Trash2 size={13} /> Clear collection
        </button>
      )}
    </div>
  );
}
