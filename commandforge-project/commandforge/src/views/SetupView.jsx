import { Library, Lightbulb, Loader2, Search, Shuffle, Sparkles } from "lucide-react";
import ColorPips from "../components/ColorPips";
import NumBadge from "../components/NumBadge";
import { formatPrice } from "../lib/budget";
import { BRACKETS } from "../lib/buildDeck";
import { COLOR_META, houseNameForColors } from "../lib/colors";
import { THEME_SUGGESTIONS } from "../lib/queries";

export default function SetupView({
  bracket,
  budgetInput,
  collectionCount,
  collectionStatus,
  colorFilter,
  colorMatchCount,
  colorMatchError,
  colorMatchLoading,
  forge,
  houseName,
  inspired,
  isForging,
  openCollection,
  ownedCommanderCount,
  ownedOnly,
  parsedBudget,
  priceSource,
  randomizeCommander,
  randomizeError,
  resolveAndForgeFromSearch,
  search,
  searchError,
  searchLoading,
  searchResults,
  selectedCommander,
  setBracket,
  setBudgetInput,
  setHouseName,
  setInspired,
  setOwnedOnly,
  setPriceSource,
  setSearch,
  setSelectedCommander,
  setTheme,
  setUseCollection,
  theme,
  toggleColor,
  useCollection,
}) {
  const searchingOwned = useCollection && ownedOnly;
  const collectionReady = collectionStatus === "ready" && collectionCount > 0;
  // Switching what the search looks through drops a commander picked from
  // the other list.
  function switchSearch(change) {
    change();
    setSelectedCommander(null);
    setSearch("");
  }

  return (
    <div className="cf-fade">
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 cf-badge rounded-full px-4 py-1.5 text-xs font-bold tracking-widest mb-6">
          <Sparkles size={13} />
          POWERED BY LIVE SCRYFALL DATA
        </div>
        <h1 className="cf-display text-4xl sm:text-5xl text-white mb-4 leading-tight">Brewhall</h1>
        <p className="text-white/60 text-base max-w-lg mx-auto leading-relaxed">
          Search a commander, pick a power bracket, and get a legal, playable 99-card decklist tuned for that level of play.
        </p>
      </div>

      <div className="cf-panel rounded-2xl p-5 sm:p-6 mb-5">
        {collectionCount > 0 ? (
          <>
            <button
              onClick={() => switchSearch(() => setUseCollection((v) => !v))}
              disabled={!collectionReady}
              className="w-full flex items-center justify-between gap-4 text-left disabled:opacity-60"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Library size={18} className="text-white/40 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">Build from my collection</p>
                  <p className="text-xs text-white/50 mt-0.5">
                    {collectionStatus === "ready"
                      ? `Only cards you own · ${collectionCount.toLocaleString()} cards, ${ownedCommanderCount} commander${ownedCommanderCount === 1 ? "" : "s"}`
                      : collectionStatus === "error"
                      ? "Couldn't look your cards up on Scryfall. Reload to try again."
                      : "Loading your collection…"}
                  </p>
                </div>
              </div>
              <span className={`w-11 h-6 rounded-full shrink-0 flex items-center px-0.5 transition ${useCollection ? "bg-purple-500 justify-end" : "bg-white/15 justify-start"}`}>
                <span className="w-5 h-5 rounded-full bg-white block" />
              </span>
            </button>
            {useCollection && (
              <label className="flex items-center gap-2 mt-3 pl-[30px] text-xs text-white/60 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!ownedOnly}
                  onChange={(e) => switchSearch(() => setOwnedOnly(!e.target.checked))}
                  className="accent-purple-500"
                />
                Let me pick a commander I don't own
              </label>
            )}
          </>
        ) : (
          <button onClick={openCollection} className="w-full flex items-center gap-3 text-left">
            <Library size={18} className="text-white/40 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">Build from your own cards</p>
              <p className="text-xs text-white/50 mt-0.5">
                Import your collection from ManaBox or paste a list, and decks use only cards you own. <span className="cf-gold underline underline-offset-2">Add your collection</span>
              </p>
            </div>
          </button>
        )}
      </div>

      <div className="cf-panel rounded-2xl p-5 sm:p-6 mb-5">
        <div className="relative mb-2">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedCommander(null);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              resolveAndForgeFromSearch();
            }}
            placeholder={searchingOwned ? "Search commanders you own…" : "Search any commander ever printed…"}
            className="w-full bg-black/40 border border-white/15 rounded-xl pl-10 pr-3 py-3.5 text-base sm:text-sm text-white placeholder-white/35 outline-none focus:border-[#E3B25C]/60"
          />
        </div>
        <p className="text-[11px] text-white/30 mb-2">
          {searchingOwned
            ? "Legendary creatures and other commanders in your collection, most played first."
            : "Live search via Scryfall — every legal commander, not a fixed list."}
        </p>

        {selectedCommander && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-purple-400/50 bg-purple-500/10 mb-1">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white break-words">{selectedCommander.name}</p>
              <p className="text-xs text-white/50 truncate">{selectedCommander.blurb}</p>
            </div>
            <ColorPips identity={selectedCommander.identity} size="sm" />
          </div>
        )}

        {!selectedCommander && searchLoading && (
          <p className="text-xs text-white/40 py-3 text-center flex items-center justify-center gap-1.5">
            <Loader2 size={12} className="animate-spin" /> Searching Scryfall…
          </p>
        )}

        {!selectedCommander && !searchLoading && searchError && (
          <p className="text-xs text-red-300/70 py-3 text-center">Couldn't reach Scryfall — check your connection and try again.</p>
        )}

        {!selectedCommander && !searchLoading && !searchError && search.trim() && searchResults.length === 0 && (
          <p className="text-xs text-white/40 py-3 text-center">
            {searchingOwned ? `You don't own a commander matching "${search.trim()}".` : `No commander found for "${search.trim()}".`}
          </p>
        )}

        {searchingOwned && !selectedCommander && !search.trim() && searchResults.length === 0 && (
          <p className="text-xs text-white/40 py-3 text-center">There are no commanders in your collection yet. Tick the box above to pick any commander.</p>
        )}

        {!selectedCommander && !searchLoading && !searchError && searchResults.length > 0 && (
          <div className="max-h-56 overflow-y-auto space-y-1.5">
            {searchResults.map((c) => (
              <button
                key={c.name}
                onClick={() => {
                  setSelectedCommander(c);
                  setSearch(c.name);
                }}
                className="w-full text-left px-4 py-2.5 rounded-xl border border-transparent bg-black/30 hover:border-white/15 flex items-center justify-between gap-3 transition"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white break-words">{c.name}</p>
                  <p className="text-xs text-white/50 truncate">{c.blurb}</p>
                </div>
                <ColorPips identity={c.identity} size="sm" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="cf-panel rounded-2xl p-5 sm:p-6 mb-5">
        <p className="text-xs text-white/50 mb-4 tracking-widest font-semibold uppercase">Power Bracket</p>
        <div className="grid grid-cols-2 gap-3">
          {BRACKETS.map((b) => (
            <button
              key={b.id}
              onClick={() => setBracket(b)}
              className={`text-left px-4 py-3.5 rounded-xl border transition ${
                bracket?.id === b.id
                  ? "border-purple-400 bg-purple-500/15 shadow-[0_0_0_1px_rgba(167,139,250,0.4),0_0_24px_-8px_rgba(167,139,250,0.6)]"
                  : "border-white/12 bg-black/30 hover:border-white/25"
              }`}
            >
              <p className="text-sm font-bold text-white">{b.id}. {b.name}</p>
              <p className="text-xs text-white/50 mt-0.5">{b.tag}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="cf-panel rounded-2xl p-5 sm:p-6 mb-5">
        <p className="text-xs text-white/50 mb-4 tracking-widest font-semibold uppercase">Deck Style</p>
        <button
          onClick={() => setInspired((v) => !v)}
          className="w-full flex items-center justify-between gap-4 px-4 py-4 rounded-xl border border-white/12 bg-black/30 text-left"
        >
          <div className="flex items-center gap-3 min-w-0">
            <Lightbulb size={18} className="text-white/40 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">Inspired by real decks</p>
              <p className="text-xs text-white/50 mt-0.5">Leans into cards matching your commander's known archetype</p>
            </div>
          </div>
          <span className={`w-11 h-6 rounded-full shrink-0 flex items-center px-0.5 transition ${inspired ? "bg-purple-500 justify-end" : "bg-white/15 justify-start"}`}>
            <span className="w-5 h-5 rounded-full bg-white block" />
          </span>
        </button>
      </div>

      <div className="cf-panel rounded-2xl p-5 sm:p-6 mb-5">
        <p className="text-xs text-white/50 mb-4 tracking-widest font-semibold uppercase">Card Images & Pricing</p>
        <div className="flex flex-col sm:flex-row gap-2">
          {[
            { id: "none", label: "No Pricing" },
            { id: "usd", label: "TCGPlayer ($)" },
            { id: "eur", label: "Cardmarket (€)" },
          ].map((opt) => (
            <button
              key={opt.id}
              onClick={() => setPriceSource(opt.id)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition ${
                priceSource === opt.id
                  ? "border-purple-400 bg-purple-500/20 text-white"
                  : "border-white/12 bg-black/30 text-white/70 hover:border-white/25"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {priceSource !== "none" && (
          <p className="text-xs text-white/40 mt-3 leading-relaxed">
            Images and prices are pulled live from Scryfall, which itself sources USD pricing from TCGPlayer and EUR pricing from Cardmarket.
          </p>
        )}

        {priceSource !== "none" && useCollection && (
          <p className="text-xs text-white/40 mt-3 leading-relaxed">
            No budget needed when building from your collection: you already own the cards. Prices show what they're worth.
          </p>
        )}

        {priceSource !== "none" && !useCollection && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <p className="text-xs text-white/50 mb-2 font-semibold">Budget (optional)</p>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40 text-sm">
                {priceSource === "eur" ? "€" : "$"}
              </span>
              <input
                type="number"
                min="0"
                inputMode="decimal"
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                placeholder="No limit — leans into pricier staples"
                className="w-full bg-black/40 border border-white/15 rounded-xl pl-7 pr-3 py-3 text-base sm:text-sm text-white placeholder-white/35 outline-none focus:border-[#E3B25C]/60"
              />
            </div>
            <p className="text-xs text-white/40 mt-2 leading-relaxed">
              {budgetInput.trim()
                ? "The builder spreads this across the whole deck — no single card takes more than about a fifth of it — then spends up toward the total on stronger cards."
                : "Leave this blank and the builder favors pricier, higher-power staples instead of budget alternatives."}
            </p>
          </div>
        )}
      </div>

      <button
        onClick={forge}
        disabled={!selectedCommander || !bracket || isForging}
        className="w-full py-3.5 rounded-xl border-2 border-[#E3B25C]/70 bg-[#E3B25C]/15 hover:bg-[#E3B25C]/25 disabled:border-white/15 disabled:bg-white/5 disabled:text-white/25 disabled:cursor-not-allowed transition text-white font-semibold text-sm flex items-center justify-center gap-2 mb-8"
      >
        {isForging ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
        {isForging ? "Forging…" : "Forge Commander Deck"}
      </button>

      <div className="flex items-center gap-3 mb-6">
        <div className="h-px bg-white/10 flex-1" />
        <p className="text-xs text-white/40 tracking-widest font-semibold uppercase">or randomize by color</p>
        <div className="h-px bg-white/10 flex-1" />
      </div>

      <div className="cf-panel rounded-2xl p-5 sm:p-6 mb-8">
        <div className="flex justify-center gap-2 sm:gap-3 mb-4">
          {["W", "U", "B", "R", "G", "C"].map((c) => (
            <button
              key={c}
              onClick={() => toggleColor(c)}
              title={COLOR_META[c].label}
              className={`w-10 h-10 sm:w-11 sm:h-11 shrink-0 rounded-full border-2 flex items-center justify-center font-bold text-sm transition ${
                colorFilter.includes(c) ? "border-transparent" : "border-white/20 text-white/50 hover:border-white/40"
              }`}
              style={colorFilter.includes(c) ? { backgroundColor: COLOR_META[c].swatch, color: "#1a1225" } : {}}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="relative mb-3">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35" />
          <input
            value={houseName}
            onChange={(e) => setHouseName(e.target.value)}
            placeholder="Or type a house name — Azorius, Grixis…"
            className="w-full bg-black/40 border border-white/15 rounded-xl pl-10 pr-3 py-3 text-base sm:text-sm text-white placeholder-white/35 outline-none focus:border-[#E3B25C]/60"
          />
        </div>
        <p className="text-center text-xs text-white/40 mb-4">
          {colorFilter.length === 0 && !houseName.trim()
            ? searchingOwned ? `Any of your ${colorMatchCount ?? 0} commanders` : "Any color identity"
            : colorMatchLoading
            ? "Checking Scryfall…"
            : colorMatchError
            ? "Couldn't reach Scryfall"
            : colorMatchCount === 0
            ? searchingOwned ? "You don't own a commander in these colors" : "No legal commander fits this combo"
            : houseName.trim() || searchingOwned
            ? `${colorMatchCount ?? "…"} ${searchingOwned ? "owned " : ""}commander${colorMatchCount === 1 ? "" : "s"} match`
            : houseNameForColors(colorFilter)}
        </p>

        <div className="mb-4">
          <label className="block text-[11px] text-white/40 uppercase tracking-wide font-semibold mb-1.5">
            Deck theme (optional) — type anything
          </label>
          <input
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="e.g. lifegain, voltron, dragons, mill…"
            className="w-full bg-black/40 border border-white/15 rounded-xl px-3 py-3 text-base sm:text-sm text-white placeholder-white/35 outline-none focus:border-[#E3B25C]/60"
          />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {THEME_SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setTheme(s)}
                className="text-[11px] px-2.5 py-1 rounded-full border border-white/15 text-white/50 hover:text-white hover:border-white/35 transition"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl bg-black/30 border border-white/10 px-4 py-3 mb-4">
          <p className="text-[11px] text-white/40 uppercase tracking-wide font-semibold mb-1">This will also use</p>
          <p className="text-xs text-white/70 leading-relaxed">
            Bracket: <span className="text-white font-semibold">{bracket ? `${bracket.id} · ${bracket.name}` : "none selected yet"}</span>
            {useCollection && (
              <>
                {" · "}<span className="text-white font-semibold">{ownedOnly ? "A commander you own" : "Any commander"}, cards from your collection</span>
              </>
            )}
            {priceSource !== "none" && !useCollection && (
              <>
                {" · "}Budget: <span className="text-white font-semibold">{parsedBudget ? formatPrice(parsedBudget, priceSource) : "no limit"}</span>
              </>
            )}
            {theme.trim() && (
              <>
                {" · "}Theme: <span className="text-white font-semibold">{theme.trim()}</span>
              </>
            )}
          </p>
          {!bracket && (
            <p className="text-xs text-amber-400/80 mt-1">Pick a Power Bracket above first — it applies to Randomize too.</p>
          )}
          {randomizeError && (
            <p className="text-xs text-red-300/80 mt-1">Couldn't fetch a commander from Scryfall — try again.</p>
          )}
        </div>

        <button
          onClick={randomizeCommander}
          disabled={colorMatchCount === 0 || !bracket || isForging}
          className="w-full py-3.5 rounded-xl border-2 border-purple-400/60 bg-purple-500/15 hover:bg-purple-500/25 disabled:border-white/15 disabled:bg-white/5 disabled:text-white/25 disabled:cursor-not-allowed text-white font-semibold text-sm flex items-center justify-center gap-2 transition"
        >
          {isForging ? <Loader2 size={16} className="animate-spin" /> : <Shuffle size={16} />}
          {isForging ? "Forging…" : searchingOwned ? "Random Commander I Own" : "Randomize Commander"}
        </button>
      </div>

      <div className="space-y-3">
        {[
          { n: 1, title: "Color-identity legal", desc: "Every card respects your commander's color identity — fully Commander-legal." },
          { n: 2, title: "Bracket-aware", desc: "Ramp, removal, and win-condition density scale with the bracket you choose." },
          { n: 3, title: "Save to your account", desc: "Sign in to keep your decks and open them on any device." },
        ].map((f) => (
          <div key={f.n} className="cf-panel-alt rounded-xl p-4 flex items-start gap-4">
            <NumBadge n={f.n} />
            <div>
              <p className="text-sm font-bold text-white">{f.title}</p>
              <p className="text-xs text-white/50 mt-1 leading-relaxed">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
