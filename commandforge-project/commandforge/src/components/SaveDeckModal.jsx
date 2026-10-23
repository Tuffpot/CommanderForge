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
        <h3 className="cf-display text-lg text-parchment mb-4">Name this deck</h3>
        <input
          value={deckName}
          onChange={(e) => setDeckName(e.target.value)}
          placeholder={`${deck?.commander.name} Deck`}
          className="cf-field py-2.5 mb-2"
          autoFocus
        />
        {deckSaveError && <p className="text-xs text-red-300/80 mb-2">{deckSaveError}</p>}
        <div className="flex gap-3 mt-2">
          <button
            onClick={saveDeck}
            className="flex-1 py-2.5 cf-btn-primary"
          >
            Save
          </button>
          <button
            onClick={() => setSaveModalOpen(false)}
            className="flex-1 py-2.5 cf-btn-quiet"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
