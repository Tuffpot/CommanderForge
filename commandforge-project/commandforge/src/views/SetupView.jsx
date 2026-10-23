import { Library, Lightbulb, Loader2, Search, Shuffle } from "lucide-react";
import ColorPips from "../components/ColorPips";
import Star from "../components/Star";
import { formatPrice } from "../lib/budget";
import { BRACKETS } from "../lib/buildDeck";
import { COLOR_META, houseNameForColors } from "../lib/colors";
import { THEME_SUGGESTIONS } from "../lib/queries";

function Step({ n, title, hint }) {
  return (
    <div className="cf-step">
      <span className="cf-step-num">{n}</span>
      <div className="min-w-0">
        <h2 className="cf-step-title">{title}</h2>
        {hint && <p className="text-xs text-parchment/45 mt-0.5">{hint}</p>}
      </div>
    </div>
  );
}

const HOW_IT_WORKS = [
  {
    title: "Always legal",
    body: "Every card fits your commander's colour identity and the Commander ban list, so the 99 you get is one you can actually sit down and play.",
  },
  {
    title: "Tuned to your table",
    body: "Each deck has 62 spells and 37 lands, and the bracket decides the mix. A casual Exhibition deck runs around six ramp spells and leaves room for fun cards; a cEDH list packs fourteen ramp and twelve pieces of removal.",
  },
  {
    title: "Built from what you own",
    body: "Import a ManaBox or Moxfield export and Brewhall builds only from your cards, then tells you which few pickups would round the deck out. Sign in to keep decks and collections on any device.",
  },
];

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
      <div className="text-center mb-12 pt-2">
        <p className="cf-eyebrow mb-3">A Commander deck builder</p>
        <h1 className="cf-display text-[2.6rem] sm:text-6xl text-parchment mb-5 leading-[1.05] font-medium">
          Brew a deck worth <em className="text-brass font-normal">sleeving&nbsp;up.</em>
        </h1>
        <p className="text-parchment/65 text-base sm:text-lg max-w-xl mx-auto leading-relaxed">
          Pick a commander and a power level. Brewhall puts together a legal, playable 99 from live Scryfall card
          data, tuned for the table you play at.
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
                <Library size={18} className="text-brass/70 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-parchment">Build from my collection</p>
                  <p className="text-xs text-parchment/50 mt-0.5">
                    {collectionStatus === "ready"
                      ? `Only cards you own · ${collectionCount.toLocaleString()} cards, ${ownedCommanderCount} commander${ownedCommanderCount === 1 ? "" : "s"}`
                      : collectionStatus === "error"
                      ? "Couldn't look your cards up on Scryfall. Reload to try again."
                      : "Loading your collection…"}
                  </p>
                </div>
              </div>
              <span className="cf-switch" data-on={useCollection} />
            </button>
            {useCollection && (
              <label className="flex items-center gap-2 mt-3 pl-[30px] text-xs text-parchment/60 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!ownedOnly}
                  onChange={(e) => switchSearch(() => setOwnedOnly(!e.target.checked))}
                  className="accent-[#E3B25C]"
                />
                Let me pick a commander I don't own
              </label>
            )}
          </>
        ) : (
          <button onClick={openCollection} className="w-full flex items-center gap-3 text-left">
            <Library size={18} className="text-brass/70 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-parchment">Build from your own cards</p>
              <p className="text-xs text-parchment/50 mt-0.5">
                Import your collection from ManaBox or paste a list, and decks use only cards you own.{" "}
                <span className="cf-link">Add your collection</span>
              </p>
            </div>
          </button>
        )}
      </div>

      <div className="cf-panel rounded-2xl p-5 sm:p-6 mb-5">
        <Step
          n={1}
          title="Choose your commander"
          hint={searchingOwned
            ? "Legendary creatures and other commanders in your collection, most played first."
            : "Searches every legal commander on Scryfall, not a fixed list."}
        />
        <div className="relative mb-2">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-parchment/35" />
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
            placeholder={searchingOwned ? "Search commanders you own…" : "Atraxa, Krenko, Edgar Markov…"}
            className="cf-field pl-10 py-3.5"
          />
        </div>

        {selectedCommander && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-brass/50 bg-brass/10 mt-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-parchment break-words">{selectedCommander.name}</p>
              <p className="text-xs text-parchment/50 truncate">{selectedCommander.blurb}</p>
            </div>
            <ColorPips identity={selectedCommander.identity} size="sm" />
          </div>
        )}

        {!selectedCommander && searchLoading && (
          <p className="text-xs text-parchment/40 py-3 text-center flex items-center justify-center gap-1.5">
            <Loader2 size={12} className="animate-spin" /> Searching Scryfall…
          </p>
        )}

        {!selectedCommander && !searchLoading && searchError && (
          <p className="text-xs text-red-300/80 py-3 text-center">Couldn't reach Scryfall. Check your connection and try again.</p>
        )}

        {!selectedCommander && !searchLoading && !searchError && search.trim() && searchResults.length === 0 && (
          <p className="text-xs text-parchment/40 py-3 text-center">
            {searchingOwned ? `You don't own a commander matching "${search.trim()}".` : `No commander found for "${search.trim()}".`}
          </p>
        )}

        {searchingOwned && !selectedCommander && !search.trim() && searchResults.length === 0 && (
          <p className="text-xs text-parchment/40 py-3 text-center">There are no commanders in your collection yet. Tick the box above to pick any commander.</p>
        )}

        {!selectedCommander && !searchLoading && !searchError && searchResults.length > 0 && (
          <div className="max-h-56 overflow-y-auto space-y-1.5 mt-3">
            {searchResults.map((c) => (
              <button
                key={c.name}
                onClick={() => {
                  setSelectedCommander(c);
                  setSearch(c.name);
                }}
                className="w-full text-left px-4 py-2.5 rounded-xl border border-transparent bg-black/30 hover:border-brass/30 flex items-center justify-between gap-3 transition"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-parchment break-words">{c.name}</p>
                  <p className="text-xs text-parchment/50 truncate">{c.blurb}</p>
                </div>
                <ColorPips identity={c.identity} size="sm" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="cf-panel rounded-2xl p-5 sm:p-6 mb-5">
        <Step n={2} title="Pick a power bracket" hint="How hard the deck hits. Ramp, removal and win conditions scale with it." />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {BRACKETS.map((b) => (
            <button
              key={b.id}
              onClick={() => setBracket(b)}
              aria-pressed={bracket?.id === b.id}
              className="cf-choice text-left px-4 py-3.5 flex items-baseline gap-3"
            >
              <span className="cf-display text-2xl text-brass/80 leading-none">{b.id}</span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-parchment">{b.name}</span>
                <span className="block text-xs text-parchment/50 mt-0.5">{b.tag}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="cf-panel rounded-2xl p-5 sm:p-6 mb-5">
        <Step n={3} title="Set the style" />
        <button
          onClick={() => setInspired((v) => !v)}
          className="w-full flex items-center justify-between gap-4 px-4 py-4 rounded-xl border border-white/10 bg-black/25 text-left"
        >
          <div className="flex items-center gap-3 min-w-0">
            <Lightbulb size={18} className="text-brass/70 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-parchment">Inspired by real decks</p>
              <p className="text-xs text-parchment/50 mt-0.5">Leans into cards that suit the way your commander is usually played.</p>
            </div>
          </div>
          <span className="cf-switch" data-on={inspired} />
        </button>
      </div>

      <div className="cf-panel rounded-2xl p-5 sm:p-6 mb-6">
        <Step n={4} title="Card images and prices" hint="Optional. Turn on a price source to see card images, prices and a deck total." />
        <div className="flex flex-col sm:flex-row gap-2">
          {[
            { id: "none", label: "No prices" },
            { id: "usd", label: "TCGplayer ($)" },
            { id: "eur", label: "Cardmarket (€)" },
          ].map((opt) => (
            <button
              key={opt.id}
              onClick={() => setPriceSource(opt.id)}
              aria-pressed={priceSource === opt.id}
              className="cf-choice flex-1 py-2.5 text-sm font-semibold text-parchment/80"
            >
              {opt.label}
            </button>
          ))}
        </div>
        {priceSource !== "none" && (
          <p className="text-xs text-parchment/45 mt-3 leading-relaxed">
            Images and prices come live from Scryfall, which gets dollar prices from TCGplayer and euro prices from Cardmarket.
          </p>
        )}

        {priceSource !== "none" && useCollection && (
          <p className="text-xs text-parchment/45 mt-3 leading-relaxed">
            No budget needed when building from your collection: you already own the cards. Prices show what they're worth.
          </p>
        )}

        {priceSource !== "none" && !useCollection && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <p className="text-xs text-parchment/60 mb-2 font-semibold">Budget (optional)</p>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-parchment/40 text-sm">
                {priceSource === "eur" ? "€" : "$"}
              </span>
              <input
                type="number"
                min="0"
                inputMode="decimal"
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                placeholder="No limit"
                className="cf-field pl-7"
              />
            </div>
            <p className="text-xs text-parchment/45 mt-2 leading-relaxed">
              {budgetInput.trim()
                ? "Brewhall spreads this across the whole deck, so no single card takes more than about a fifth of it, then spends up toward the total on stronger cards."
                : "Leave this blank and Brewhall reaches for the pricier, higher-power staples instead of budget alternatives."}
            </p>
          </div>
        )}
      </div>

      <button
        onClick={forge}
        disabled={!selectedCommander || !bracket || isForging}
        className="cf-btn-primary w-full py-4 text-base mb-2"
      >
        {isForging ? <Loader2 size={17} className="animate-spin" /> : <Star size={14} />}
        {isForging ? "Brewing…" : "Brew this deck"}
      </button>
      <p className="text-center text-xs text-parchment/40 mb-10 min-h-[1rem]">
        {!selectedCommander && !bracket
          ? "Choose a commander and a bracket to start."
          : !selectedCommander
          ? "Choose a commander to start."
          : !bracket
          ? "Pick a bracket to start."
          : "Takes a few seconds while the cards come in from Scryfall."}
      </p>

      <div className="cf-rule mb-6">
        <p className="cf-eyebrow">or roll a random commander</p>
      </div>

      <div className="cf-panel rounded-2xl p-5 sm:p-6 mb-14">
        <p className="text-sm text-parchment/60 text-center mb-4">
          Not sure who to play? Narrow it down by colour or theme and let Brewhall choose.
        </p>
        <div className="flex justify-center gap-2 sm:gap-3 mb-4">
          {["W", "U", "B", "R", "G", "C"].map((c) => (
            <button
              key={c}
              onClick={() => toggleColor(c)}
              title={COLOR_META[c].label}
              aria-pressed={colorFilter.includes(c)}
              className={`w-10 h-10 sm:w-11 sm:h-11 shrink-0 rounded-full border-2 flex items-center justify-center font-bold text-sm transition ${
                colorFilter.includes(c) ? "border-transparent shadow-[0_0_0_2px_rgba(11,8,18,1),0_0_0_3px_rgba(227,178,92,0.6)]" : "border-white/20 text-parchment/50 hover:border-white/40"
              }`}
              style={colorFilter.includes(c) ? { backgroundColor: COLOR_META[c].swatch, color: "#1a1225" } : {}}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="relative mb-3">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-parchment/35" />
          <input
            value={houseName}
            onChange={(e) => setHouseName(e.target.value)}
            placeholder="Or type a guild, like Azorius or Grixis"
            className="cf-field pl-10"
          />
        </div>
        <p className="text-center text-xs text-parchment/45 mb-5">
          {colorFilter.length === 0 && !houseName.trim()
            ? searchingOwned ? `Any of your ${colorMatchCount ?? 0} commanders` : "Any colour identity"
            : colorMatchLoading
            ? "Checking Scryfall…"
            : colorMatchError
            ? "Couldn't reach Scryfall"
            : colorMatchCount === 0
            ? searchingOwned ? "You don't own a commander in these colours" : "No legal commander fits this combination"
            : houseName.trim() || searchingOwned
            ? `${colorMatchCount ?? "…"} ${searchingOwned ? "owned " : ""}commander${colorMatchCount === 1 ? "" : "s"} match`
            : houseNameForColors(colorFilter)}
        </p>

        <div className="mb-4">
          <label htmlFor="cf-theme" className="block text-xs text-parchment/60 font-semibold mb-1.5">
            Deck theme <span className="font-normal text-parchment/40">(optional, type anything)</span>
          </label>
          <input
            id="cf-theme"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="Lifegain, voltron, dragons, mill…"
            className="cf-field"
          />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {THEME_SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => setTheme(s)} className="cf-chip">
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl bg-black/25 border border-white/10 px-4 py-3 mb-4">
          <p className="text-xs text-parchment/70 leading-relaxed">
            <span className="text-parchment/45">Also uses </span>
            bracket <span className="text-parchment font-semibold">{bracket ? `${bracket.id}, ${bracket.name}` : "(none picked yet)"}</span>
            {useCollection && (
              <>
                {" · "}<span className="text-parchment font-semibold">{ownedOnly ? "a commander you own" : "any commander"}, cards from your collection</span>
              </>
            )}
            {priceSource !== "none" && !useCollection && (
              <>
                {" · "}budget <span className="text-parchment font-semibold">{parsedBudget ? formatPrice(parsedBudget, priceSource) : "no limit"}</span>
              </>
            )}
            {theme.trim() && (
              <>
                {" · "}theme <span className="text-parchment font-semibold">{theme.trim()}</span>
              </>
            )}
          </p>
          {!bracket && (
            <p className="text-xs text-amber-300/80 mt-1">Pick a power bracket above first. It applies to random commanders too.</p>
          )}
          {randomizeError && (
            <p className="text-xs text-red-300/80 mt-1">Couldn't fetch a commander from Scryfall. Try again.</p>
          )}
        </div>

        <button
          onClick={randomizeCommander}
          disabled={colorMatchCount === 0 || !bracket || isForging}
          className="cf-btn-secondary w-full py-3.5"
        >
          {isForging ? <Loader2 size={16} className="animate-spin" /> : <Shuffle size={16} />}
          {isForging ? "Brewing…" : searchingOwned ? "Surprise me with one I own" : "Surprise me"}
        </button>
      </div>

      <section aria-labelledby="cf-how">
        <h2 id="cf-how" className="cf-display text-2xl sm:text-3xl text-parchment text-center mb-2">
          How Brewhall builds a deck
        </h2>
        <p className="text-sm text-parchment/50 text-center mb-7 max-w-md mx-auto">
          No fixed lists. Just live card data and a recipe for each power bracket.
        </p>
        <div className="grid sm:grid-cols-3 gap-4">
          {HOW_IT_WORKS.map((f) => (
            <div key={f.title} className="cf-panel-alt rounded-xl p-5">
              <p className="flex items-center gap-2 cf-display text-lg text-parchment mb-2">
                <span className="text-brass"><Star size={11} /></span>
                {f.title}
              </p>
              <p className="text-sm text-parchment/55 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
