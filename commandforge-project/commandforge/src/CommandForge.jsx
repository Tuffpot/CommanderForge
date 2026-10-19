import { useState, useEffect } from "react";
import { Search, Sparkles, Swords, Save, ChevronLeft, Shuffle, Lightbulb, Check, ExternalLink, Loader2, X, ClipboardCopy, User, LogOut } from "lucide-react";
import { supabase } from "./supabaseClient";
import { COLOR_META, houseNameForColors } from "./lib/colors";
import { buildNameQuery, filterAndSortByName, buildColorQuery, resolveThemeQuery, THEME_SUGGESTIONS } from "./lib/queries";
import { scryfallSearchCommanders, scryfallRandomCommander, scryfallCardPageUrl } from "./lib/scryfall";
import { priceOf, formatPrice } from "./lib/budget";
import { BRACKETS, CAT_LABELS, buildDeck } from "./lib/buildDeck";
import { describeDeck } from "./lib/describeDeck";
import ColorPips from "./components/ColorPips";
import NumBadge from "./components/NumBadge";
import CardRow from "./components/CardRow";
import { PreviewImage, CommanderArt } from "./components/CardImages";


/* ---------------------------------------------------------
   UI
--------------------------------------------------------- */
export default function CommandForge() {
  const [view, setView] = useState("setup");
  const [search, setSearch] = useState("");
  const [selectedCommander, setSelectedCommander] = useState(null);
  const [bracket, setBracket] = useState(null);
  const [inspired, setInspired] = useState(false);
  const [colorFilter, setColorFilter] = useState([]);
  const [houseName, setHouseName] = useState("");
  const [theme, setTheme] = useState("");
  const [deck, setDeck] = useState(null);
  const [savedDecks, setSavedDecks] = useState([]);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [deckName, setDeckName] = useState("");
  const [viewingSaved, setViewingSaved] = useState(null);
  const [priceSource, setPriceSource] = useState("none"); // 'none' | 'usd' | 'eur'
  const [cardData, setCardData] = useState({});
  const [cardDataStatus, setCardDataStatus] = useState("idle"); // idle | loading | done | error
  const [previewCard, setPreviewCard] = useState(null);
  const [budgetInput, setBudgetInput] = useState("");
  const [isForging, setIsForging] = useState(false);

  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [colorMatchCount, setColorMatchCount] = useState(null);
  const [colorMatchLoading, setColorMatchLoading] = useState(false);
  const [colorMatchError, setColorMatchError] = useState(false);
  const [randomizeError, setRandomizeError] = useState(false);
  const [cardmarketCopied, setCardmarketCopied] = useState(false);
  const [cardmarketCopyError, setCardmarketCopyError] = useState(false);

  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState("signin"); // 'signin' | 'signup'
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [decksLoading, setDecksLoading] = useState(false);
  const [deckSaveError, setDeckSaveError] = useState("");

  // Track the Supabase auth session for the lifetime of the app.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Pull this user's saved decks from Supabase whenever they sign in (or
  // clear the local list when they sign out).
  useEffect(() => {
    if (!session) {
      setSavedDecks([]);
      return;
    }
    refreshSavedDecks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function refreshSavedDecks() {
    setDecksLoading(true);
    const { data, error } = await supabase
      .from("decks")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) {
      setSavedDecks(
        data.map((row) => ({
          id: row.id,
          deckName: row.deck_name,
          commander: row.commander,
          identity: row.identity,
          source: row.source,
          bracketName: row.bracket_name,
          picks: row.picks,
          nonbasics: row.nonbasics,
          basics: row.basics,
          priceSource: row.price_source,
          cardData: row.card_data,
        }))
      );
    }
    setDecksLoading(false);
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();
    setAuthError("");
    setAuthNotice("");
    setAuthSubmitting(true);
    try {
      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email: authEmail, password: authPassword });
        if (error) throw error;
        if (!data.session) {
          setAuthNotice("Check your email to confirm your account, then sign in.");
          setAuthMode("signin");
        } else {
          setAuthModalOpen(false);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
        if (error) throw error;
        setAuthModalOpen(false);
      }
      setAuthEmail("");
      setAuthPassword("");
    } catch (err) {
      setAuthError(err.message || "Something went wrong.");
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  // Live-search commanders on Scryfall as the person types. Skips the call
  // entirely once a commander has actually been selected.
  useEffect(() => {
    if (selectedCommander) return;
    setSearchError(false);
    // A slow response for an earlier keystroke mustn't overwrite the results
    // for what's typed now.
    let stale = false;
    const handle = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const { cards } = await scryfallSearchCommanders(buildNameQuery(search));
        if (stale) return;
        const filtered = filterAndSortByName(cards, search);
        setSearchResults(filtered);
        const exact = filtered.find((c) => c.name.toLowerCase() === search.trim().toLowerCase());
        if (exact) setSelectedCommander(exact);
      } catch {
        setSearchError(true);
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 350);
    return () => {
      stale = true;
      clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, selectedCommander]);

  // Live match count for the color-randomizer path.
  useEffect(() => {
    setColorMatchError(false);
    const handle = setTimeout(async () => {
      setColorMatchLoading(true);
      try {
        const { total } = await scryfallSearchCommanders(buildColorQuery(colorFilter, houseName, theme));
        setColorMatchCount(total);
      } catch {
        setColorMatchError(true);
        setColorMatchCount(null);
      } finally {
        setColorMatchLoading(false);
      }
    }, 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorFilter, houseName, theme]);

  // Colourless can't combine with a colour, so picking one clears the other.
  function toggleColor(c) {
    setColorFilter((prev) => {
      if (prev.includes(c)) return prev.filter((x) => x !== c);
      if (c === "C") return ["C"];
      return [...prev.filter((x) => x !== "C"), c];
    });
  }

  async function resolveAndForgeFromSearch() {
    const query = search.trim();
    if (!query || isForging) return;
    setSearchLoading(true);
    try {
      const { cards } = await scryfallSearchCommanders(buildNameQuery(query));
      const filtered = filterAndSortByName(cards, query);
      setSearchResults(filtered);
      const exact = filtered.find((c) => c.name.toLowerCase() === query.toLowerCase());
      const resolved = selectedCommander || exact || filtered[0];
      if (!resolved) return;
      setSelectedCommander(resolved);
      setSearch(resolved.name);
      if (bracket) await forgeWith(resolved, bracket);
    } catch {
      setSearchError(true);
    } finally {
      setSearchLoading(false);
    }
  }

  const parsedBudget = budgetInput.trim() ? parseFloat(budgetInput) : null;

  function deckTotalPrice() {
    if (!deck || priceSource === "none") return null;
    let total = 0;
    let anyPriced = false;
    const cmd = cardData[deck.commander.name.toLowerCase()];
    const cmdPrice = priceSource === "eur" ? cmd?.priceEur : cmd?.priceUsd;
    if (cmdPrice != null) { total += parseFloat(cmdPrice); anyPriced = true; }
    Object.values(deck.picks).flat().forEach((c) => {
      const d = cardData[c.name.toLowerCase()];
      const p = priceSource === "eur" ? d?.priceEur : d?.priceUsd;
      if (p != null) { total += parseFloat(p); anyPriced = true; }
    });
    // Basics are left out on purpose, matching the budget (which never
    // charges for them) and the note shown under the land list.
    deck.nonbasics.forEach((l) => {
      const d = cardData[l.name.toLowerCase()];
      const p = priceSource === "eur" ? d?.priceEur : d?.priceUsd;
      if (p != null) { total += parseFloat(p) * l.qty; anyPriced = true; }
    });
    return anyPriced ? total : null;
  }

  // Fetches (or reuses cached) prices for the whole eligible card pool, then
  // builds the deck against real prices, then reuses that same data to show
  // images/prices/total on the result screen — all triggered by the click,
  // not preloaded before the person has even picked a commander.
  async function forgeWith(commander, activeBracket, usedTheme = null) {
    setIsForging(true);
    setCardDataStatus("loading");
    try {
      // A chosen theme is as strong a signal as the EDHREC-inspired toggle
      // that the supporting 99 should lean into a specific archetype, so it
      // forces archetype-aware building even if that toggle is off.
      const buildStyle = inspired || usedTheme ? "edhrec" : "random";
      const built = await buildDeck(commander, buildStyle, activeBracket, {
        budget: parsedBudget,
        priceSource,
        themeQuery: usedTheme ? resolveThemeQuery(usedTheme) : null,
      });
      setDeck({
        commander,
        // The style actually used, so a theme-driven build isn't described
        // as "randomly assembled".
        style: buildStyle,
        theme: usedTheme,
        shortfall: built.shortfall,
        bracket: activeBracket,
        budgetTarget: parsedBudget,
        picks: built.picks,
        nonbasics: built.nonbasics,
        basics: built.basics,
      });

      // The commander's own image/price/oracle text already came back with
      // the search or randomize call, so fold it in directly. Its price falls
      // back to the cheapest-printing lookup buildDeck did when the printing
      // the search returned had none.
      const backfilled = built.cardData[commander.name.toLowerCase()];
      const commanderEntry = {
        name: commander.name,
        imageSmall: commander.imageSmall,
        imageLarge: commander.imageLarge,
        priceUsd: commander.priceUsd ?? backfilled?.priceUsd ?? null,
        priceEur: commander.priceEur ?? backfilled?.priceEur ?? null,
        scryfallUri: commander.scryfallUri,
        oracleText: commander.oracleText,
      };
      setCardData({ ...built.cardData, [commander.name.toLowerCase()]: commanderEntry });
      setCardDataStatus("done");
    } catch {
      setCardDataStatus("error");
    } finally {
      setIsForging(false);
      setView("result");
    }
  }

  async function forge() {
    if (!selectedCommander || !bracket) return;
    await forgeWith(selectedCommander, bracket);
  }

  async function randomizeCommander() {
    if (!bracket) return;
    setRandomizeError(false);
    setIsForging(true);
    try {
      const commander = await scryfallRandomCommander(buildColorQuery(colorFilter, houseName, theme));
      if (!commander) {
        setRandomizeError(true);
        setIsForging(false);
        return;
      }
      setSelectedCommander(commander);
      await forgeWith(commander, bracket, theme);
    } catch {
      setRandomizeError(true);
      setIsForging(false);
    }
  }

  // cardData holds every candidate Scryfall returned (well over a thousand
  // cards with rules text), so a saved deck keeps only its own cards.
  function deckCardData(d, data) {
    const names = [
      d.commander.name,
      ...Object.values(d.picks).flat().map((c) => c.name),
      ...d.nonbasics.map((l) => l.name),
      ...d.basics.map((l) => l.name),
    ];
    const out = {};
    names.forEach((n) => {
      const entry = data[n.toLowerCase()];
      if (entry) out[n.toLowerCase()] = entry;
    });
    return out;
  }

  async function saveDeck() {
    if (!deck || !session) return;
    setDeckSaveError("");
    const { error } = await supabase.from("decks").insert({
      user_id: session.user.id,
      deck_name: deckName.trim() || `${deck.commander.name} Deck`,
      commander: deck.commander.name,
      identity: deck.commander.identity,
      source: deck.style === "edhrec" ? "edhrec_inspired" : "random",
      bracket_name: deck.bracket.name,
      picks: deck.picks,
      nonbasics: deck.nonbasics,
      basics: deck.basics,
      price_source: priceSource,
      card_data: priceSource !== "none" ? deckCardData(deck, cardData) : {},
    });
    if (error) {
      setDeckSaveError(error.message || "Couldn't save this deck.");
      return;
    }
    await refreshSavedDecks();
    setSaveModalOpen(false);
    setDeckName("");
  }

  // Cardmarket's wants-list importer accepts plain "<quantity> <card name>"
  // lines pasted straight in — confirmed via their own help docs. Basics are
  // left out since nobody actually needs to buy Plains/Islands.
  function cardmarketList(commanderName, picks, nonbasics) {
    const lines = [`1 ${commanderName}`];
    Object.values(picks).flat().forEach((c) => lines.push(`1 ${c.name}`));
    nonbasics.forEach((l) => lines.push(`${l.qty} ${l.name}`));
    return lines.join("\n");
  }

  async function copyForCardmarket(commanderName, picks, nonbasics) {
    const text = cardmarketList(commanderName, picks, nonbasics);
    try {
      await navigator.clipboard.writeText(text);
      setCardmarketCopied(true);
      setTimeout(() => setCardmarketCopied(false), 2000);
    } catch {
      setCardmarketCopyError(true);
      setTimeout(() => setCardmarketCopyError(false), 2500);
    }
  }

  async function deleteDeck(id) {
    if (viewingSaved?.id === id) setViewingSaved(null);
    setSavedDecks((prev) => prev.filter((d) => d.id !== id)); // optimistic
    const { error } = await supabase.from("decks").delete().eq("id", id);
    // If the delete didn't go through, put the list back as it really is
    // rather than leaving a deck that reappears on the next visit.
    if (error) await refreshSavedDecks();
  }

  function reset() {
    setView("setup");
    setSearch("");
    setSelectedCommander(null);
    setBracket(null);
    setInspired(false);
    setColorFilter([]);
    setHouseName("");
    setDeck(null);
    setCardData({});
    setCardDataStatus("idle");
  }

  return (
    <div className="min-h-screen w-full text-white" style={{ fontFamily: "'Manrope', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;900&family=Manrope:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap');
        .cf-display { font-family: 'Cinzel', serif; letter-spacing: 0.02em; }
        .cf-mono { font-family: 'JetBrains Mono', monospace; }
        .cf-bg {
          background-color: #0B0812;
          background-image: radial-gradient(ellipse 900px 500px at 50% 0%, rgba(88,58,120,0.45), transparent 70%);
        }
        .cf-panel { background-color: #150F20; border: 1px solid rgba(255,255,255,0.08); }
        .cf-panel-alt { background-color: #0F0A18; border: 1px solid rgba(255,255,255,0.06); }
        .cf-gold { color: #E3B25C; }
        .cf-badge { background-color: rgba(60,40,20,0.55); border: 1px solid rgba(227,178,92,0.4); color: #E3B25C; }
        @keyframes cfFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .cf-fade { animation: cfFade .4s ease-out both; }
      `}</style>

      <div className="cf-bg min-h-screen">
        <header className="bg-black border-b border-white/10 sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-4 sm:px-5 py-4 flex items-center justify-between gap-2 sm:gap-4">
            <button onClick={reset} className="flex items-center gap-3 shrink-0" aria-label="Commander Forge home">
              <span className="w-10 h-10 rounded-xl bg-[#E3B25C] flex items-center justify-center text-black shrink-0">
                <Swords size={20} strokeWidth={2.5} />
              </span>
              <span className="cf-display text-lg text-white whitespace-nowrap hidden sm:inline">Commander Forge</span>
            </button>
            <div className="flex items-center gap-1 sm:gap-2 min-w-0">
              <nav className="flex items-center gap-1">
                <button
                  onClick={() => setView("setup")}
                  className={`px-3 sm:px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition ${
                    view !== "decks" ? "bg-[#E3B25C] text-black" : "text-white/70 hover:text-white"
                  }`}
                >
                  Forge
                </button>
                <button
                  onClick={() => setView("decks")}
                  className={`px-3 sm:px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition ${
                    view === "decks" ? "bg-[#E3B25C] text-black" : "text-white/70 hover:text-white"
                  }`}
                >
                  My Decks{savedDecks.length > 0 ? ` (${savedDecks.length})` : ""}
                </button>
              </nav>
              <div className="w-px h-6 bg-white/15 mx-1 hidden sm:block" />
              {authLoading ? (
                <Loader2 size={16} className="animate-spin text-white/30" />
              ) : session ? (
                <button
                  onClick={() => {
                    // On a phone this is a lone icon with no email beside it,
                    // so a tap meant to check the account shouldn't sign out.
                    if (window.confirm(`Sign out of ${session.user.email}?`)) handleSignOut();
                  }}
                  title={session.user.email}
                  aria-label="Sign out"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold text-white/70 hover:text-white transition"
                >
                  <User size={14} />
                  <span className="hidden sm:inline max-w-[120px] truncate">{session.user.email}</span>
                  <LogOut size={13} />
                </button>
              ) : (
                <button
                  onClick={() => {
                    setAuthMode("signin");
                    setAuthError("");
                    setAuthNotice("");
                    setAuthModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap shrink-0 border border-white/20 text-white/80 hover:border-white/40 hover:text-white transition"
                >
                  <User size={14} /> Sign In
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-4 sm:px-5 py-8 sm:py-12">
          {view === "setup" && (
            <div className="cf-fade">
              <div className="text-center mb-10">
                <div className="inline-flex items-center gap-2 cf-badge rounded-full px-4 py-1.5 text-xs font-bold tracking-widest mb-6">
                  <Sparkles size={13} />
                  POWERED BY LIVE SCRYFALL DATA
                </div>
                <h1 className="cf-display text-4xl sm:text-5xl text-white mb-4 leading-tight">Commander Forge</h1>
                <p className="text-white/60 text-base max-w-lg mx-auto leading-relaxed">
                  Search a commander, pick a power bracket, and get a legal, playable 99-card decklist tuned for that level of play.
                </p>
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
                    placeholder="Search any commander ever printed…"
                    className="w-full bg-black/40 border border-white/15 rounded-xl pl-10 pr-3 py-3.5 text-base sm:text-sm text-white placeholder-white/35 outline-none focus:border-[#E3B25C]/60"
                  />
                </div>
                <p className="text-[11px] text-white/30 mb-2">Live search via Scryfall — every legal commander, not a fixed list.</p>

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
                  <p className="text-xs text-white/40 py-3 text-center">No commander found for "{search.trim()}".</p>
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

                {priceSource !== "none" && (
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
                    ? "Any color identity"
                    : colorMatchLoading
                    ? "Checking Scryfall…"
                    : colorMatchError
                    ? "Couldn't reach Scryfall"
                    : colorMatchCount === 0
                    ? "No legal commander fits this combo"
                    : houseName.trim()
                    ? `${colorMatchCount ?? "…"} commander${colorMatchCount === 1 ? "" : "s"} match`
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
                    {priceSource !== "none" && (
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
                  {isForging ? "Forging…" : "Randomize Commander"}
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
          )}

          {view === "result" && deck && (
            <div className="cf-fade">
              <button onClick={reset} className="flex items-center gap-1 text-sm text-white/50 hover:text-white/80 mb-5 transition">
                <ChevronLeft size={16} /> Back
              </button>

              <div className="cf-panel rounded-2xl p-5 sm:p-6 mb-6">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="cf-mono text-[11px] cf-gold font-semibold tracking-wide">
                    {deck.style === "edhrec" ? "EDHREC-INSPIRED" : "RANDOM BUILD"}
                  </span>
                  <span className="text-white/30">·</span>
                  <span className="cf-mono text-[11px] text-purple-300 font-semibold tracking-wide">
                    BRACKET {deck.bracket.id} · {deck.bracket.name.toUpperCase()}
                  </span>
                </div>
                <div className="flex items-start gap-4 flex-wrap">
                  {priceSource !== "none" && <CommanderArt imageUrl={deck.commander.imageLarge} />}
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="min-w-0">
                        <h2 className="cf-display text-2xl sm:text-3xl text-white break-words">{deck.commander.name}</h2>
                        <p className="text-sm text-white/55 mt-1.5">{deck.commander.blurb}</p>
                      </div>
                      <ColorPips identity={deck.commander.identity} />
                    </div>
                    {priceSource !== "none" && (
                      <p className="text-xs text-white/45 leading-relaxed whitespace-pre-line mt-2.5">
                        {cardDataStatus === "loading"
                          ? "Loading card text…"
                          : cardData[deck.commander.name.toLowerCase()]?.oracleText || "Card text unavailable."}
                      </p>
                    )}
                  </div>
                </div>

                <p className="text-sm text-white/70 leading-relaxed mt-4 pt-4 border-t border-white/10">
                  {describeDeck(deck)}
                </p>

                {priceSource !== "none" && (
                  <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
                    <span className="text-xs text-white/50">
                      Estimated deck total, commander included ({priceSource === "eur" ? "Cardmarket" : "TCGPlayer"})
                    </span>
                    {cardDataStatus === "loading" ? (
                      <span className="flex items-center gap-1.5 text-xs text-white/50">
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

                {priceSource !== "none" && cardDataStatus === "done" && deck.budgetTarget != null && deckTotalPrice() != null && (
                  <p className={`text-xs mt-2 text-right ${deckTotalPrice() <= deck.budgetTarget ? "text-green-400/80" : "text-amber-400/80"}`}>
                    {deckTotalPrice() <= deck.budgetTarget
                      ? `Under your ${formatPrice(deck.budgetTarget, priceSource)} budget by ${formatPrice(deck.budgetTarget - deckTotalPrice(), priceSource)}`
                      : `${formatPrice(deckTotalPrice() - deck.budgetTarget, priceSource)} over your ${formatPrice(deck.budgetTarget, priceSource)} budget — ${(priceOf(deck.commander.name, cardData, priceSource) ?? 0) >= deck.budgetTarget ? "the commander alone costs more than the budget, so the rest was built as cheaply as possible" : "not enough cheap eligible cards to fit every slot"}`}
                  </p>
                )}
              </div>

              {cardDataStatus === "done" && deck.shortfall > 0 && (
                <div className="cf-panel rounded-xl p-4 mb-4 border-amber-400/30">
                  <p className="text-xs text-white/60 leading-relaxed">
                    Scryfall didn't return enough cards to fill {deck.shortfall} spell slot{deck.shortfall === 1 ? "" : "s"}, so {deck.shortfall === 1 ? "an extra basic land was" : `${deck.shortfall} extra basic lands were`} added instead. That happens when a narrow theme or colour combination has few matching cards, or when Scryfall was briefly busy, in which case forging again usually fixes it.
                  </p>
                </div>
              )}

              {cardDataStatus === "error" && (
                <div className="cf-panel rounded-xl p-4 mb-4 border-red-400/30">
                  <p className="text-xs text-white/60 leading-relaxed">
                    Couldn't reach Scryfall to source this deck's cards — every category and land now pulls live from their API, so this needs a working connection. Check your internet connection and try forging again. If some categories partially loaded, you may see a lighter deck below with extra basic lands filling the gap.
                  </p>
                </div>
              )}

              <div className="space-y-3 mb-6">
                {Object.entries(deck.picks).map(([cat, cards]) =>
                  cards.length ? (
                    <div key={cat} className="cf-panel-alt rounded-xl p-4">
                      <p className="cf-mono text-[11px] cf-gold font-semibold mb-2.5 tracking-wide">
                        {CAT_LABELS[cat].toUpperCase()} · {cards.length}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                        {cards.map((c) => (
                          <CardRow
                            key={c.name}
                            name={c.name}
                            qty={1}
                            cardData={cardData}
                            priceSource={priceSource}
                            onPreview={setPreviewCard}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null
                )}

                <div className="cf-panel-alt rounded-xl p-4">
                  <p className="cf-mono text-[11px] cf-gold font-semibold mb-2.5 tracking-wide">
                    LANDS · {deck.nonbasics.reduce((a, l) => a + l.qty, 0) + deck.basics.reduce((a, l) => a + l.qty, 0)}
                  </p>
                  {priceSource !== "none" && deck.basics.length > 0 && (
                    <p className="text-xs text-white/50 mb-2.5">
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
                        onPreview={setPreviewCard}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 mb-3">
                <button
                  onClick={() => {
                    if (session) {
                      setSaveModalOpen(true);
                    } else {
                      setAuthMode("signin");
                      setAuthError("");
                      setAuthNotice("Sign in (or create a free account) to save this deck.");
                      setAuthModalOpen(true);
                    }
                  }}
                  className="flex-1 py-3.5 rounded-xl border-2 border-[#E3B25C]/70 bg-[#E3B25C]/15 hover:bg-[#E3B25C]/25 transition text-white font-semibold text-sm flex items-center justify-center gap-2"
                >
                  <Save size={15} /> {session ? "Save Deck" : "Sign In to Save"}
                </button>
                <button
                  onClick={reset}
                  className="flex-1 py-3.5 rounded-xl border-2 border-white/25 bg-white/5 hover:bg-white/10 transition text-white/85 font-semibold text-sm flex items-center justify-center gap-2"
                >
                  Forge Another
                </button>
              </div>

              <button
                onClick={() => copyForCardmarket(deck.commander.name, deck.picks, deck.nonbasics)}
                className="w-full py-3 rounded-xl border-2 border-white/15 bg-white/5 hover:bg-white/10 transition text-white/75 font-semibold text-sm flex items-center justify-center gap-2"
              >
                {cardmarketCopied ? (
                  <>
                    <Check size={15} className="text-green-400" /> Copied — paste straight into a Cardmarket Wants list
                  </>
                ) : cardmarketCopyError ? (
                  <>Couldn't copy — your browser may be blocking clipboard access</>
                ) : (
                  <>
                    <ClipboardCopy size={15} /> Copy for Cardmarket Wants List
                  </>
                )}
              </button>
            </div>
          )}

          {view === "decks" && (
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
                    onClick={() => {
                      setAuthMode("signin");
                      setAuthError("");
                      setAuthNotice("");
                      setAuthModalOpen(true);
                    }}
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
          )}
        </main>
      </div>

      {saveModalOpen && (
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
      )}

      {authModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 sm:p-6 z-20 overflow-y-auto" onClick={() => setAuthModalOpen(false)}>
          <div className="cf-panel rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="cf-display text-lg text-white">{authMode === "signup" ? "Create Account" : "Sign In"}</h3>
              <button onClick={() => setAuthModalOpen(false)} className="-m-2 p-2 text-white/40 hover:text-white transition" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="flex gap-2 mb-4">
              <button
                onClick={() => { setAuthMode("signin"); setAuthError(""); setAuthNotice(""); }}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${
                  authMode === "signin" ? "bg-purple-500/20 text-white border border-purple-400/50" : "text-white/50 border border-white/10"
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => { setAuthMode("signup"); setAuthError(""); setAuthNotice(""); }}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${
                  authMode === "signup" ? "bg-purple-500/20 text-white border border-purple-400/50" : "text-white/50 border border-white/10"
                }`}
              >
                Create Account
              </button>
            </div>

            <form onSubmit={handleAuthSubmit}>
              <input
                type="email"
                required
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="Email"
                className="w-full bg-black/40 border border-white/15 rounded-xl px-3 py-2.5 text-base sm:text-sm text-white placeholder-white/35 mb-2 outline-none focus:border-purple-400/60"
              />
              <input
                type="password"
                required
                minLength={6}
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="Password"
                className="w-full bg-black/40 border border-white/15 rounded-xl px-3 py-2.5 text-base sm:text-sm text-white placeholder-white/35 mb-3 outline-none focus:border-purple-400/60"
              />

              {authNotice && <p className="text-xs cf-gold mb-3">{authNotice}</p>}
              {authError && <p className="text-xs text-red-300/80 mb-3">{authError}</p>}

              <button
                type="submit"
                disabled={authSubmitting}
                className="w-full py-2.5 rounded-xl border-2 border-purple-400/60 bg-purple-500/15 hover:bg-purple-500/25 disabled:opacity-50 text-white font-semibold text-sm transition flex items-center justify-center gap-2"
              >
                {authSubmitting && <Loader2 size={14} className="animate-spin" />}
                {authMode === "signup" ? "Create Account" : "Sign In"}
              </button>
            </form>
          </div>
        </div>
      )}

      {previewCard && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 sm:p-6 z-20" onClick={() => setPreviewCard(null)}>
          <div className="cf-panel rounded-2xl p-5 w-full max-w-xs max-h-full overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-end mb-2">
              <button onClick={() => setPreviewCard(null)} className="-m-2 p-2 text-white/40 hover:text-white transition" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <PreviewImage imageUrl={previewCard.imageLarge} name={previewCard.name} />
            <p className="text-sm font-semibold text-white mb-1">{previewCard.name}</p>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-white/50">
                {priceSource === "eur" ? "Cardmarket" : "TCGPlayer"} price
              </span>
              <span className="cf-mono text-sm cf-gold font-semibold">
                {formatPrice(priceSource === "eur" ? previewCard.priceEur : previewCard.priceUsd, priceSource)}
              </span>
            </div>
            <a
              href={previewCard.scryfallUri || scryfallCardPageUrl(previewCard.name)}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-white/25 bg-white/5 hover:bg-white/10 text-white/85 font-semibold text-sm transition"
            >
              View on Scryfall <ExternalLink size={14} />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
