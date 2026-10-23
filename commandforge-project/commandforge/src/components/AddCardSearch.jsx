import { useEffect, useState } from "react";
import { Loader2, Plus, Search } from "lucide-react";
import { searchAddableCards } from "../lib/scryfall";

// Finds a card by name, among those the commander's colours allow, and adds
// it to the deck.
export default function AddCardSearch({ identity, inDeck, onAdd }) {
  const [text, setText] = useState("");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | loading | done | error

  useEffect(() => {
    if (text.trim().length < 2) {
      setResults([]);
      setStatus("idle");
      return;
    }
    // A slow answer for an earlier keystroke mustn't replace this one's.
    let stale = false;
    const handle = setTimeout(async () => {
      setStatus("loading");
      try {
        const cards = await searchAddableCards(text, identity);
        if (stale) return;
        setResults(cards);
        setStatus("done");
      } catch {
        if (!stale) setStatus("error");
      }
    }, 350);
    return () => {
      stale = true;
      clearTimeout(handle);
    };
  }, [text, identity]);

  return (
    <div>
      <label htmlFor="cf-add-card" className="block text-xs text-parchment/60 font-semibold mb-1.5">
        Add a card
      </label>
      <div className="relative">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-parchment/35" />
        <input
          id="cf-add-card"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search by name, like Smothering Tithe"
          className="cf-field pl-9"
        />
      </div>
      {status === "loading" && (
        <p className="text-xs text-parchment/40 py-2 flex items-center gap-1.5">
          <Loader2 size={12} className="animate-spin" /> Searching Scryfall…
        </p>
      )}
      {status === "error" && <p className="text-xs text-red-300/80 py-2">Couldn&apos;t reach Scryfall. Check your connection and try again.</p>}
      {status === "done" && !results.length && (
        <p className="text-xs text-parchment/40 py-2">No card by that name fits this commander&apos;s colours.</p>
      )}
      {results.length > 0 && status !== "loading" && (
        <div className="max-h-60 overflow-y-auto space-y-1 mt-2">
          {results.map((card) => {
            const added = inDeck(card.name);
            return (
              <div key={card.id || card.name} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/25 border border-white/10">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-parchment/85 truncate">{card.name}</p>
                  <p className="text-[11px] text-parchment/45 truncate">{card.card_faces?.[0]?.type_line || card.type_line}</p>
                </div>
                <button
                  onClick={() => onAdd(card)}
                  disabled={added && !/\bBasic\b/.test(card.type_line || "")}
                  className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full border border-brass/40 text-[11px] font-semibold text-brass hover:border-brass hover:text-parchment disabled:opacity-40 disabled:hover:border-brass/40 transition"
                >
                  {added && !/\bBasic\b/.test(card.type_line || "") ? "In deck" : <><Plus size={12} /> Add</>}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
