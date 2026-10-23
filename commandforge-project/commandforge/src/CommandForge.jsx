import { useState, useEffect, useMemo } from "react";
import { supabase, supabaseUrl, supabaseAnonKey } from "./supabaseClient";
import { buildNameQuery, filterAndSortByName, buildColorQuery, resolveThemeQuery } from "./lib/queries";
import { scryfallSearchCommanders, scryfallRandomCommander, mapScryfallCardToCommander } from "./lib/scryfall";
import { buildDeck, NONLAND_TARGET } from "./lib/buildDeck";
import { buildDeckFromCollection } from "./lib/buildFromCollection";
import { parseCollectionText, fetchCollectionCards, mergeEntries, ownedCommanders, playableCount } from "./lib/collection";
import { HOUSE_NAMES } from "./lib/colors";
import Header from "./components/Header";
import Footer from "./components/Footer";
import { loadAdSense } from "./lib/ads";
import { fetchEnabledProviders, startOAuthSignIn, waitForNativeSignIn } from "./lib/oauth";
import SaveDeckModal from "./components/SaveDeckModal";
import AuthModal from "./components/AuthModal";
import CardPreviewModal from "./components/CardPreviewModal";
import SetupView from "./views/SetupView";
import ResultView from "./views/ResultView";
import MyDecksView from "./views/MyDecksView";
import CollectionView from "./views/CollectionView";

// Where a signed-out visitor's collection is kept.
const LOCAL_COLLECTION_KEY = "cf-collection";

function readLocalCollection() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_COLLECTION_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalCollection(entries) {
  try {
    if (entries.length) localStorage.setItem(LOCAL_COLLECTION_KEY, JSON.stringify(entries));
    else localStorage.removeItem(LOCAL_COLLECTION_KEY);
    return true;
  } catch {
    return false;
  }
}

// The colours picked in the randomizer, as a colour identity ("C" is colourless).
function pickedIdentity(colorFilter, houseName) {
  const colors = HOUSE_NAMES[houseName.trim().toLowerCase()] || colorFilter;
  if (!colors.length) return null;
  return colors.includes("C") ? [] : colors;
}

function sameIdentity(a, b) {
  return a.length === b.length && a.every((c) => b.includes(c));
}


/* ---------------------------------------------------------
   UI
--------------------------------------------------------- */
export default function CommandForge() {
  // Loads Google's ad script (and with it the cookie consent message) when
  // AdSense is configured; does nothing otherwise.
  useEffect(() => loadAdSense(), []);

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
  const [oauthProviders, setOauthProviders] = useState([]);
  const [decksLoading, setDecksLoading] = useState(false);
  const [deckSaveError, setDeckSaveError] = useState("");
  const [accountDeleting, setAccountDeleting] = useState(false);
  const [accountDeleteError, setAccountDeleteError] = useState("");

  // The person's card collection: name + quantity entries (what's stored),
  // and the full Scryfall data for each card (looked up when it loads).
  const [collection, setCollection] = useState([]);
  const [ownedCards, setOwnedCards] = useState({});
  const [collectionStatus, setCollectionStatus] = useState("idle"); // idle | loading | resolving | ready | error
  const [collectionError, setCollectionError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(null);
  const [importError, setImportError] = useState("");
  const [notFound, setNotFound] = useState([]);
  const [useCollection, setUseCollection] = useState(false);
  const [ownedOnly, setOwnedOnly] = useState(true);

  // Track the Supabase auth session for the lifetime of the app.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    const stopNativeSignIn = waitForNativeSignIn(supabase, (message) => {
      setAuthError(message);
      setAuthModalOpen(true);
    });
    return () => {
      listener.subscription.unsubscribe();
      stopNativeSignIn();
    };
  }, []);

  // Show "Continue with Google / Apple" only for providers switched on in
  // Supabase.
  useEffect(() => {
    fetchEnabledProviders(supabaseUrl, supabaseAnonKey).then(setOauthProviders);
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

  // Load the collection: from the account when signed in, otherwise from
  // this browser. A collection made before signing in moves to the account
  // if the account doesn't have one yet.
  useEffect(() => {
    if (authLoading) return;
    let stale = false;
    (async () => {
      setCollectionStatus("loading");
      setCollectionError("");
      let entries = readLocalCollection();
      if (session) {
        const { data, error } = await supabase.from("collections").select("cards").maybeSingle();
        if (stale) return;
        if (error) {
          setCollectionError("Couldn't load the collection saved to your account. Please try again later.");
          entries = [];
        } else if (data?.cards?.length) {
          entries = data.cards;
        } else if (entries.length) {
          const { error: saveError } = await supabase
            .from("collections")
            .upsert({ user_id: session.user.id, cards: entries, updated_at: new Date().toISOString() });
          if (!saveError) writeLocalCollection([]);
        }
      }
      if (stale) return;
      setCollection(entries);
      await resolveCollection(entries, () => stale);
    })();
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, authLoading]);

  async function resolveCollection(entries, isStale = () => false) {
    if (!entries.length) {
      setOwnedCards({});
      setCollectionStatus("ready");
      return;
    }
    setCollectionStatus("resolving");
    try {
      const { cards } = await fetchCollectionCards(entries);
      if (isStale()) return;
      setOwnedCards(cards);
      setCollectionStatus("ready");
    } catch {
      if (!isStale()) setCollectionStatus("error");
    }
  }

  async function saveCollection(entries) {
    if (!session) return writeLocalCollection(entries) ? null : "This browser wouldn't let us save your collection.";
    const { error } = await supabase
      .from("collections")
      .upsert({ user_id: session.user.id, cards: entries, updated_at: new Date().toISOString() });
    return error ? "Couldn't save your collection to your account. Please try again." : null;
  }

  // Reads a ManaBox CSV (or a pasted list), checks every card against
  // Scryfall, then adds it to or replaces the collection.
  async function importCollection(text, mode) {
    setImportError("");
    setNotFound([]);
    const parsed = parseCollectionText(text);
    if (!parsed.length) {
      setImportError("Couldn't find any cards in that. Use a CSV export, or one card per line like \"1 Sol Ring\".");
      return false;
    }
    // One lookup per printing or name, however many rows it's on.
    const unique = new Map();
    parsed.forEach((e) => {
      const key = (e.scryfallId || e.name).toLowerCase();
      unique.set(key, { ...e, qty: (unique.get(key)?.qty || 0) + e.qty });
    });
    setImporting(true);
    setImportProgress(null);
    try {
      const result = await fetchCollectionCards([...unique.values()], (done, total) => setImportProgress({ done, total }));
      const entries = mode === "replace" ? result.entries : mergeEntries(collection, result.entries);
      const saveError = await saveCollection(entries);
      if (saveError) {
        setImportError(saveError);
        return false;
      }
      setCollection(entries);
      setOwnedCards((prev) => (mode === "replace" ? result.cards : { ...prev, ...result.cards }));
      setCollectionStatus("ready");
      setNotFound(result.notFound);
      return true;
    } catch {
      setImportError("Couldn't reach Scryfall to check the cards. Check your connection and try again.");
      return false;
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  }

  async function clearCollection() {
    const saveError = await saveCollection([]);
    if (saveError) {
      setCollectionError(saveError);
      return;
    }
    setCollection([]);
    setOwnedCards({});
    setNotFound([]);
    setUseCollection(false);
  }

  const ownedCommanderList = useMemo(() => ownedCommanders(ownedCards).map(mapScryfallCardToCommander), [ownedCards]);
  const searchingOwned = useCollection && ownedOnly;

  function startCollectionBuild() {
    setUseCollection(true);
    setSelectedCommander(null);
    setSearch("");
    setView("setup");
  }

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

  async function handleOAuthSignIn(provider) {
    setAuthError("");
    setAuthNotice("");
    try {
      await startOAuthSignIn(supabase, provider);
    } catch (err) {
      setAuthError(err.message || "Something went wrong.");
    }
  }

  // The apps sign in through a separate browser, so close the pop-up once the
  // session arrives.
  useEffect(() => {
    if (session) setAuthModalOpen(false);
  }, [session]);

  function openAuthModal(notice = "") {
    setAuthMode("signin");
    setAuthError("");
    setAuthNotice(notice);
    setAuthModalOpen(true);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  // Permanently deletes the signed-in account and its saved decks (the app
  // stores require an in-app way to do this). The delete_my_account database
  // function does the work; see the README for its SQL.
  async function deleteAccount() {
    setAccountDeleteError("");
    setAccountDeleting(true);
    const { error } = await supabase.rpc("delete_my_account");
    setAccountDeleting(false);
    if (error) {
      setAccountDeleteError("Couldn't delete your account. Please try again, or contact us if it keeps happening.");
      return;
    }
    setViewingSaved(null);
    setSavedDecks([]);
    // The account is gone, so only the local sign-in needs clearing.
    await supabase.auth.signOut({ scope: "local" });
  }

  // Live-search commanders on Scryfall as the person types. Skips the call
  // entirely once a commander has actually been selected.
  useEffect(() => {
    if (selectedCommander) return;
    setSearchError(false);
    // Building from the collection: search the commanders they own, no
    // Scryfall call needed.
    if (searchingOwned) {
      setSearchLoading(false);
      const filtered = search.trim() ? filterAndSortByName(ownedCommanderList, search) : ownedCommanderList;
      setSearchResults(filtered.slice(0, 60));
      const exact = filtered.find((c) => c.name.toLowerCase() === search.trim().toLowerCase());
      if (exact) setSelectedCommander(exact);
      return;
    }
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
  }, [search, selectedCommander, searchingOwned, ownedCommanderList]);

  // Live match count for the color-randomizer path.
  useEffect(() => {
    setColorMatchError(false);
    if (searchingOwned) {
      const wanted = pickedIdentity(colorFilter, houseName);
      setColorMatchLoading(false);
      setColorMatchCount(wanted ? ownedCommanderList.filter((c) => sameIdentity(c.identity, wanted)).length : ownedCommanderList.length);
      return;
    }
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
  }, [colorFilter, houseName, theme, searchingOwned, ownedCommanderList]);

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
    if (searchingOwned) {
      const resolved = selectedCommander || searchResults[0];
      if (!resolved) return;
      setSelectedCommander(resolved);
      setSearch(resolved.name);
      if (bracket) await forgeWith(resolved, bracket);
      return;
    }
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
      const themeQuery = usedTheme ? resolveThemeQuery(usedTheme) : null;
      const built = useCollection
        ? await buildDeckFromCollection(commander, buildStyle, activeBracket, ownedCards, { priceSource, theme: usedTheme, themeQuery })
        : await buildDeck(commander, buildStyle, activeBracket, { budget: parsedBudget, priceSource, themeQuery });
      setDeck({
        commander,
        // The style actually used, so a theme-driven build isn't described
        // as "randomly assembled".
        style: buildStyle,
        theme: usedTheme,
        shortfall: built.shortfall,
        bracket: activeBracket,
        // Owned cards cost nothing, so a collection build has no budget.
        budgetTarget: useCollection ? null : parsedBudget,
        fromCollection: useCollection,
        commanderOwned: Boolean(ownedCards[commander.name.toLowerCase()]),
        shortRoles: built.shortRoles || {},
        suggestions: built.suggestions || {},
        missingCount: built.missingCount || 0,
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
      const commander = searchingOwned
        ? randomOwnedCommander()
        : await scryfallRandomCommander(buildColorQuery(colorFilter, houseName, theme));
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

  // A random owned commander in the picked colours, preferring ones the
  // collection has enough cards to fill a deck for.
  function randomOwnedCommander() {
    const wanted = pickedIdentity(colorFilter, houseName);
    const inColors = ownedCommanderList.filter((c) => !wanted || sameIdentity(c.identity, wanted));
    const buildable = inColors.filter((c) => playableCount(c, ownedCards) >= NONLAND_TARGET);
    const pool = buildable.length ? buildable : inColors;
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
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
      source: deck.fromCollection ? "collection" : deck.style === "edhrec" ? "edhrec_inspired" : "random",
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

  // For a collection build: only the cards the person doesn't own yet,
  // plus the suggested ones for roles the collection is short on.
  function neededList(d) {
    const lines = [];
    if (!d.commanderOwned) lines.push(`1 ${d.commander.name}`);
    Object.values(d.picks).flat().filter((c) => c.missing).forEach((c) => lines.push(`1 ${c.name}`));
    Object.values(d.suggestions || {}).flat().forEach((name) => lines.push(`1 ${name}`));
    return lines.join("\n");
  }

  async function copyForCardmarket(commanderName, picks, nonbasics) {
    await copyText(cardmarketList(commanderName, picks, nonbasics));
  }

  async function copyNeededForCardmarket(d) {
    await copyText(neededList(d));
  }

  async function copyText(text) {
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
    <div className="min-h-screen w-full text-parchment">
      <div className="cf-bg min-h-screen">
        <Header
          authLoading={authLoading}
          handleSignOut={handleSignOut}
          openAuthModal={openAuthModal}
          reset={reset}
          collectionCount={collection.length}
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
              collectionCount={collection.reduce((s, e) => s + e.qty, 0)}
              collectionStatus={collectionStatus}
              ownedCommanderCount={ownedCommanderList.length}
              ownedOnly={ownedOnly}
              setOwnedOnly={setOwnedOnly}
              setUseCollection={setUseCollection}
              openCollection={() => setView("collection")}
              useCollection={useCollection}
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
              copyNeededForCardmarket={copyNeededForCardmarket}
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

          {view === "collection" && (
            <CollectionView
              clearCollection={clearCollection}
              collection={collection}
              collectionError={collectionError}
              collectionStatus={collectionStatus}
              commanderCount={ownedCommanderList.length}
              importCollection={importCollection}
              importError={importError}
              importProgress={importProgress}
              importing={importing}
              notFound={notFound}
              openAuthModal={openAuthModal}
              session={session}
              startCollectionBuild={startCollectionBuild}
            />
          )}

          {view === "decks" && (
            <MyDecksView
              cardmarketCopied={cardmarketCopied}
              copyForCardmarket={copyForCardmarket}
              accountDeleteError={accountDeleteError}
              accountDeleting={accountDeleting}
              decksLoading={decksLoading}
              deleteAccount={deleteAccount}
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
        <Footer />
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
          handleOAuthSignIn={handleOAuthSignIn}
          oauthProviders={oauthProviders}
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
