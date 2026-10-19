export default function SaveDeckModal({
  deck,
  deckName,
  deckSaveError,
  saveDeck,
  setDeckName,
  setSaveModalOpen,
}) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 sm:p-6 z-20 overflow-y-auto">
      <div className="cf-panel rounded-2xl p-6 w-full max-w-sm">
        <h3 className="cf-display text-lg text-white mb-4">Name This Deck</h3>
        <input
          value={deckName}
          onChange={(e) => setDeckName(e.target.value)}
          placeholder={`${deck?.commander.name} Deck`}
          className="w-full bg-black/40 border border-white/15 rounded-xl px-3 py-2.5 text-base sm:text-sm text-white placeholder-white/35 mb-2 outline-none focus:border-[#E3B25C]/60"
          autoFocus
        />
        {deckSaveError && <p className="text-xs text-red-300/80 mb-2">{deckSaveError}</p>}
        <div className="flex gap-3 mt-2">
          <button
            onClick={saveDeck}
            className="flex-1 py-2.5 rounded-xl border-2 border-[#E3B25C]/70 bg-[#E3B25C]/15 hover:bg-[#E3B25C]/25 text-white font-semibold text-sm transition"
          >
            Save
          </button>
          <button
            onClick={() => setSaveModalOpen(false)}
            className="flex-1 py-2.5 rounded-xl border-2 border-white/25 bg-white/5 hover:bg-white/10 text-white/85 font-semibold text-sm transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
