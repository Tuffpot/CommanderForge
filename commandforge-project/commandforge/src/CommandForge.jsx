import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import { buildNameQuery, filterAndSortByName, buildColorQuery, resolveThemeQuery } from "./lib/queries";
import { scryfallSearchCommanders, scryfallRandomCommander } from "./lib/scryfall";
import { buildDeck } from "./lib/buildDeck";
import Header from "./components/Header";
import SaveDeckModal from "./components/SaveDeckModal";
import AuthModal from "./components/AuthModal";
import CardPreviewModal from "./components/CardPreviewModal";
import SetupView from "./views/SetupView";
import ResultView from "./views/ResultView";
import MyDecksView from "./views/MyDecksView";


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

  function openAuthModal(notice = "") {
    setAuthMode("signin");
    setAuthError("");
    setAuthNotice(notice);
    setAuthModalOpen(true);
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
        <Header
          authLoading={authLoading}
          handleSignOut={handleSignOut}
          openAuthModal={openAuthModal}
          reset={reset}
          savedDecks={savedDecks}
          session={session}
          setView={setView}
          view={view}
        />

        <main className="max-w-3xl mx-auto px-4 sm:px-5 py-8 sm:py-12">
          {view === "setup" && (
            <SetupView
              bracket={bracket}
              budgetInput={budgetInput}
              colorFilter={colorFilter}
              colorMatchCount={colorMatchCount}
              colorMatchError={colorMatchError}
              colorMatchLoading={colorMatchLoading}
              forge={forge}
              houseName={houseName}
              inspired={inspired}
              isForging={isForging}
              parsedBudget={parsedBudget}
              priceSource={priceSource}
              randomizeCommander={randomizeCommander}
              randomizeError={randomizeError}
              resolveAndForgeFromSearch={resolveAndForgeFromSearch}
              search={search}
              searchError={searchError}
              searchLoading={searchLoading}
              searchResults={searchResults}
              selectedCommander={selectedCommander}
              setBracket={setBracket}
              setBudgetInput={setBudgetInput}
              setHouseName={setHouseName}
              setInspired={setInspired}
              setPriceSource={setPriceSource}
              setSearch={setSearch}
              setSelectedCommander={setSelectedCommander}
              setTheme={setTheme}
              theme={theme}
              toggleColor={toggleColor}
            />
          )}

          {view === "result" && deck && (
            <ResultView
              cardData={cardData}
              cardDataStatus={cardDataStatus}
              cardmarketCopied={cardmarketCopied}
              cardmarketCopyError={cardmarketCopyError}
              copyForCardmarket={copyForCardmarket}
              deck={deck}
              deckTotalPrice={deckTotalPrice}
              openAuthModal={openAuthModal}
              priceSource={priceSource}
              reset={reset}
              session={session}
              setPreviewCard={setPreviewCard}
              setSaveModalOpen={setSaveModalOpen}
            />
          )}

          {view === "decks" && (
            <MyDecksView
              cardmarketCopied={cardmarketCopied}
              copyForCardmarket={copyForCardmarket}
              decksLoading={decksLoading}
              deleteDeck={deleteDeck}
              openAuthModal={openAuthModal}
              savedDecks={savedDecks}
              session={session}
              setPreviewCard={setPreviewCard}
              setViewingSaved={setViewingSaved}
              viewingSaved={viewingSaved}
            />
          )}
        </main>
      </div>

      {saveModalOpen && (
        <SaveDeckModal
          deck={deck}
          deckName={deckName}
          deckSaveError={deckSaveError}
          saveDeck={saveDeck}
          setDeckName={setDeckName}
          setSaveModalOpen={setSaveModalOpen}
        />
      )}

      {authModalOpen && (
        <AuthModal
          authEmail={authEmail}
          authError={authError}
          authMode={authMode}
          authNotice={authNotice}
          authPassword={authPassword}
          authSubmitting={authSubmitting}
          handleAuthSubmit={handleAuthSubmit}
          setAuthEmail={setAuthEmail}
          setAuthError={setAuthError}
          setAuthModalOpen={setAuthModalOpen}
          setAuthMode={setAuthMode}
          setAuthNotice={setAuthNotice}
          setAuthPassword={setAuthPassword}
        />
      )}

      {previewCard && (
        <CardPreviewModal previewCard={previewCard} priceSource={priceSource} setPreviewCard={setPreviewCard} />
      )}
    </div>
  );
}
