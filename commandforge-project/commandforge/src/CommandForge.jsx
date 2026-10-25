import { useState, useEffect, useMemo, useRef } from "react";
import { supabase, supabaseUrl, supabaseAnonKey } from "./supabaseClient";
import { buildNameQuery, filterAndSortByName, buildColorQuery, resolveThemeQuery } from "./lib/queries";
import { scryfallSearchCommanders, scryfallRandomCommander, mapScryfallCardToCommander, mapScryfallCard, fetchCardsByName, fetchCheapestPrintings, fetchScryfallData } from "./lib/scryfall";
import { buildDeck, BRACKETS, NONLAND_TARGET } from "./lib/buildDeck";
import { guessArchetype } from "./lib/queries";
import { parseNameList, resolveIncludes, roleFor } from "./lib/cardLists";
import { addCard, deckHas, evenOutWithBasics, removeCard } from "./lib/editDeck";
import { fetchEdhrecCards } from "./lib/edhrec";
import { buildDeckFromCollection } from "./lib/buildFromCollection";
import { parseCollectionText, fetchCollectionCards, mergeEntries, setEntryQty, ownedCommanders, playableCount } from "./lib/collection";
import { HOUSE_NAMES } from "./lib/colors";
import { isExtraTurn } from "./lib/bracketRules";
import { commanderFromUrl, mapDeckRow, sendLink, shareUrl, sharedDeckIdFromUrl } from "./lib/shareDeck";
import { archidektList, cardmarketList, moxfieldList, neededList } from "./lib/exportDeck";
import Header from "./components/Header";
import Footer from "./components/Footer";
import { loadAdSense } from "./lib/ads";
import { loadAnalytics, track } from "./lib/analytics";
import { fetchEnabledProviders, startOAuthSignIn, waitForNativeSignIn } from "./lib/oauth";
import SaveDeckModal from "./components/SaveDeckModal";
import AuthModal from "./components/AuthModal";
import CardPreviewModal from "./components/CardPreviewModal";
import SetupView from "./views/SetupView";
import ResultView from "./views/ResultView";
import MyDecksView from "./views/MyDecksView";
import CollectionView from "./views/CollectionView";
import SharedDeckView from "./views/SharedDeckView";

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

// The person's must-include and banned card lists, kept in this browser
// between brews.
const CARD_LISTS_KEY = "cf-card-lists";

function readCardLists() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CARD_LISTS_KEY) || "{}");
    return { include: String(parsed.include || ""), exclude: String(parsed.exclude || "") };
  } catch {
    return { include: "", exclude: "" };
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
  useEffect(() => loadAnalytics(), []);

  // A share link (?deck=<id>) opens straight onto that deck.
  const [sharedDeckId] = useState(() => sharedDeckIdFromUrl(window.location.href));
  const [view, setView] = useState(sharedDeckId ? "shared" : "setup");
  const [sharedDeck, setSharedDeck] = useState({ status: sharedDeckId ? "loading" : "idle", deck: null });
  const [shareStatus, setShareStatus] = useState(null); // { id, state: "copied" | "error" }
  // A commander link (?commander=<name>) starts the search with that name,
  // which picks the commander once Scryfall finds it.
  const [linkedCommander] = useState(() => (sharedDeckId ? null : commanderFromUrl(window.location.href)));
  const [search, setSearch] = useState(linkedCommander || "");
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
  const [cardLists, setCardLists] = useState(readCardLists);
  const [pricesRefreshing, setPricesRefreshing] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [openingDeckId, setOpeningDeckId] = useState(null);
  const [openDeckError, setOpenDeckError] = useState(null);
  const [suggestionsStatus, setSuggestionsStatus] = useState("idle"); // idle | loading | done | error

  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [colorMatchCount, setColorMatchCount] = useState(null);
  const [colorMatchLoading, setColorMatchLoading] = useState(false);
  const [colorMatchError, setColorMatchError] = useState(false);
  const [randomizeError, setRandomizeError] = useState(false);
  const [copied, setCopied] = useState(null);
  const [copyError, setCopyError] = useState(null);

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

  useEffect(() => {
    if (!sharedDeckId) return;
    supabase.rpc("get_shared_deck", { deck_id: sharedDeckId }).then(({ data, error }) => {
      const row = Array.isArray(data) ? data[0] : null;
      setSharedDeck(error || !row ? { status: "missing", deck: null } : { status: "ready", deck: mapDeckRow(row) });
      track(error || !row ? "shared-deck-missing" : "shared-deck-opened");
    });
  }, [sharedDeckId]);

  // Leaving a shared deck drops ?deck= from the address bar, so a reload or
  // a bookmark lands on the brew page rather than back on that deck.
  useEffect(() => {
    if (view !== "shared" && window.location.search.includes("deck=")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [view]);

  // The same for a commander link once it has filled in the search.
  useEffect(() => {
    if (!linkedCommander) return;
    track("commander-link-opened");
    window.history.replaceState(null, "", window.location.pathname);
  }, [linkedCommander]);

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

  // Changes how many of one card the collection holds, or takes it out at
  // zero. The list updates straight away; saves run one after another so
  // quick taps on + and - land in order.
  // A removed card's Scryfall data is kept aside so Undo can put it back.
  const collectionSaves = useRef(Promise.resolve());
  const removedCardData = useRef({});
  function setCardQty(name, qty) {
    const key = name.toLowerCase();
    const entries = setEntryQty(collection, name, qty);
    setCollection(entries);
    setCollectionError("");
    if (!entries.some((e) => e.name.toLowerCase() === key)) {
      if (ownedCards[key]) removedCardData.current[key] = ownedCards[key];
      setOwnedCards((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      if (!entries.length) setUseCollection(false);
    } else if (!ownedCards[key] && removedCardData.current[key]) {
      const card = removedCardData.current[key];
      setOwnedCards((prev) => ({ ...prev, [key]: card }));
    }
    collectionSaves.current = collectionSaves.current.then(async () => {
      const saveError = await saveCollection(entries);
      if (saveError) setCollectionError(saveError);
    });
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

  useEffect(() => {
    try {
      if (cardLists.include.trim() || cardLists.exclude.trim()) localStorage.setItem(CARD_LISTS_KEY, JSON.stringify(cardLists));
      else localStorage.removeItem(CARD_LISTS_KEY);
    } catch {
      // Not saved for next time, but this brew still uses them.
    }
  }, [cardLists]);

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
      setSavedDecks(data.map(mapDeckRow));
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
      const exclude = parseNameList(cardLists.exclude);
      const includeNames = parseNameList(cardLists.include);
      const included = await resolveIncludes(includeNames, commander, priceSource);
      // A card on both lists is a must-include.
      const banned = exclude.filter((n) => !included.cards.some((c) => c.name.toLowerCase() === n.toLowerCase()));
      const lists = { include: included.cards, exclude: banned };
      const built = useCollection
        ? await buildDeckFromCollection(commander, buildStyle, activeBracket, ownedCards, { priceSource, theme: usedTheme, themeQuery, ...lists })
        : await buildDeck(commander, buildStyle, activeBracket, { budget: parsedBudget, priceSource, themeQuery, ...lists });
      setSavedNotice(false);
      setSuggestionsStatus("idle");
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
        budgetSource: priceSource,
        included: included.cards.map((c) => c.name),
        includeIssues: included.issues,
        bannedCount: banned.length,
        fromCollection: useCollection,
        commanderOwned: Boolean(ownedCards[commander.name.toLowerCase()]),
        shortRoles: built.shortRoles || {},
        suggestions: built.suggestions || {},
        missingCount: built.missingCount || 0,
        picks: built.picks,
        alternatives: built.alternatives || {},
        bracketCheck: built.bracketCheck || null,
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
      track("deck-built", { bracket: activeBracket.name, style: useCollection ? "collection" : buildStyle });
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

  // Saves the deck to the account: over the saved deck it was opened from,
  // unless `asNew`, else as a new one.
  async function saveDeck(asNew = false) {
    if (!deck || !session) return;
    setDeckSaveError("");
    const name = deckName.trim() || deck.savedName || `${deck.commander.name} Deck`;
    const row = {
      deck_name: name,
      commander: deck.commander.name,
      identity: deck.commander.identity,
      source: deck.fromCollection ? "collection" : deck.style === "edhrec" ? "edhrec_inspired" : "random",
      bracket_name: deck.bracket.name,
      picks: deck.picks,
      nonbasics: deck.nonbasics,
      basics: deck.basics,
      price_source: priceSource,
      card_data: deckCardData(deck, cardData),
    };
    const { data, error } = deck.savedId && !asNew
      ? await supabase.from("decks").update(row).eq("id", deck.savedId).select("id").single()
      : await supabase.from("decks").insert({ ...row, user_id: session.user.id }).select("id").single();
    if (error) {
      setDeckSaveError(error.message || "Couldn't save this deck.");
      return;
    }
    // Saving again updates this one rather than making another copy.
    setDeck((d) => (d ? { ...d, savedId: data.id, savedName: name } : d));
    setSavedNotice(true);
    track("deck-saved");
    await refreshSavedDecks();
    setSaveModalOpen(false);
    setDeckName("");
  }

  // Opens a saved deck on the result screen, where it can be edited and
  // saved again. Card images, prices and the commander's details are looked
  // up fresh, falling back to what was saved with it.
  async function openSavedDeck(d) {
    setOpeningDeckId(d.id);
    setOpenDeckError(null);
    const names = [
      d.commander,
      ...Object.values(d.picks).flat().map((c) => c.name),
      ...d.nonbasics.map((l) => l.name),
      ...d.basics.map((l) => l.name),
    ];
    let data = d.cardData || {};
    try {
      data = { ...data, ...(await fetchScryfallData(names)) };
    } catch {
      if (!Object.keys(data).length) {
        setOpenDeckError({ id: d.id, message: "Couldn't reach Scryfall to load this deck's cards. Check your connection and try again." });
        setOpeningDeckId(null);
        return;
      }
    }
    const c = data[d.commander.toLowerCase()] || {};
    const commander = {
      name: d.commander,
      identity: d.identity,
      archetype: guessArchetype(c.oracleText),
      blurb: c.typeLine || "Commander",
      gameChanger: Boolean(c.gameChanger),
      imageSmall: c.imageSmall || null,
      imageLarge: c.imageLarge || null,
      priceUsd: c.priceUsd || null,
      priceEur: c.priceEur || null,
      scryfallUri: c.scryfallUri || null,
      oracleText: c.oracleText || null,
    };
    setDeck({
      commander,
      style: d.source === "edhrec_inspired" ? "edhrec" : "random",
      theme: null,
      shortfall: 0,
      bracket: BRACKETS.find((b) => b.name === d.bracketName) || BRACKETS[1],
      budgetTarget: null,
      fromCollection: d.source === "collection",
      commanderOwned: Boolean(ownedCards[d.commander.toLowerCase()]),
      shortRoles: {},
      suggestions: {},
      missingCount: 0,
      picks: d.picks,
      alternatives: {},
      bracketCheck: null,
      nonbasics: d.nonbasics,
      basics: d.basics,
      savedId: d.id,
      savedName: d.deckName,
    });
    setCardData(data);
    setCardDataStatus("done");
    if (d.priceSource && d.priceSource !== "none") setPriceSource(d.priceSource);
    setSavedNotice(false);
    setSuggestionsStatus("idle");
    setOpeningDeckId(null);
    setView("result");
    window.scrollTo(0, 0);
  }

  // Switches where card images and prices come from on the result screen,
  // looking up any the deck doesn't have in that currency yet.
  async function changePriceSource(source) {
    setPriceSource(source);
    if (source === "none" || !deck) return;
    const field = source === "eur" ? "priceEur" : "priceUsd";
    const names = [
      deck.commander.name,
      ...Object.values(deck.picks).flat().map((c) => c.name),
      ...deck.nonbasics.map((l) => l.name),
      ...Object.values(deck.alternatives || {}).flat(),
      ...Object.values(deck.suggestions || {}).flat(),
    ].filter((n) => {
      const entry = cardData[n.toLowerCase()];
      return !entry || entry[field] == null || !entry.imageSmall;
    });
    if (!names.length) return;
    setPricesRefreshing(true);
    try {
      const found = await fetchCheapestPrintings(names, source);
      setCardData((prev) => {
        const next = { ...prev };
        Object.entries(found).forEach(([key, entry]) => { next[key] = { ...prev[key], ...entry }; });
        return next;
      });
    } catch {
      // Cards without a price show "—", as they do after a build.
    } finally {
      setPricesRefreshing(false);
    }
  }

  // Hand edits on the result screen.
  function addToDeck(name, role) {
    setDeck((d) => (d ? addCard(d, name, role, cardData[name.toLowerCase()]) : d));
    setSavedNotice(false);
    setPreviewCard(null);
  }

  // A card found by name search, with Scryfall's full data.
  function addSearchedCard(card) {
    setCardData((prev) => ({ ...prev, [card.name.toLowerCase()]: prev[card.name.toLowerCase()] || mapScryfallCard(card) }));
    setDeck((d) => (d ? addCard(d, card.name, roleFor(card), mapScryfallCard(card)) : d));
    setSavedNotice(false);
  }

  function removeFromDeck(name) {
    setDeck((d) => (d ? removeCard(d, name) : d));
    setSavedNotice(false);
    setPreviewCard(null);
  }

  function evenOutDeck() {
    setDeck((d) => (d ? evenOutWithBasics(d, d.commander.identity) : d));
    setSavedNotice(false);
  }

  // Cards real decks with this commander run that this one doesn't, for a
  // deck with no swaps of its own to offer (one opened from My decks).
  async function loadSuggestedAdditions() {
    if (!deck) return;
    setSuggestionsStatus("loading");
    const banned = new Set(parseNameList(cardLists.exclude).map((n) => n.toLowerCase()));
    const popular = (await fetchEdhrecCards(deck.commander.name)) || [];
    const names = popular
      .map((c) => c.name)
      .filter((n) => !deckHas(deck, n) && !banned.has(n.toLowerCase()))
      .slice(0, 30);
    if (!names.length) {
      setSuggestionsStatus(popular.length ? "done" : "error");
      return;
    }
    try {
      const cards = await fetchCardsByName(names, priceSource);
      const byRole = {};
      names.forEach((n) => {
        const card = cards.find((c) => c.name.toLowerCase() === n.toLowerCase());
        if (!card) return;
        const role = roleFor(card);
        (byRole[role] = byRole[role] || []).push(card.name);
      });
      setCardData((prev) => {
        const next = { ...prev };
        cards.forEach((c) => { next[c.name.toLowerCase()] = next[c.name.toLowerCase()] || mapScryfallCard(c); });
        return next;
      });
      setDeck((d) => (d ? { ...d, alternatives: { ...byRole, ...d.alternatives } } : d));
      setSuggestionsStatus("done");
    } catch {
      setSuggestionsStatus("error");
    }
  }

  // Copies a deck in the text format another site imports. `target` is
  // "moxfield", "archidekt", "cardmarket" or "needed" (a collection build's
  // missing cards), and is what the button that was pressed shows as copied.
  async function copyDeck(target, d) {
    const commanderName = typeof d.commander === "string" ? d.commander : d.commander.name;
    const text =
      target === "moxfield" ? moxfieldList(commanderName, d.picks, d.nonbasics, d.basics)
      : target === "archidekt" ? archidektList(commanderName, d.picks, d.nonbasics, d.basics)
      : target === "needed" ? neededList(d)
      : cardmarketList(commanderName, d.picks, d.nonbasics);
    try {
      await navigator.clipboard.writeText(text);
      setCopyError(null);
      setCopied(target);
      track("deck-exported", { target });
      setTimeout(() => setCopied((c) => (c === target ? null : c)), 2500);
    } catch {
      setCopyError(target);
      setTimeout(() => setCopyError((c) => (c === target ? null : c)), 3000);
    }
  }

  // Swaps one spell in the built deck for another in the same role. The card
  // swapped out goes back to the front of that role's alternatives so the
  // swap can be undone.
  function swapCard(cat, oldName, newName) {
    setDeck((d) => {
      if (!d) return d;
      const picks = { ...d.picks, [cat]: d.picks[cat].map((c) => (c.name === oldName ? { name: newName } : c)) };
      const alts = (d.alternatives?.[cat] || []).filter((n) => n !== newName);
      // Keep the bracket check's Game Changer and extra-turn lists current.
      const incoming = cardData[newName.toLowerCase()];
      const check = d.bracketCheck && {
        ...d.bracketCheck,
        gameChangers: [...d.bracketCheck.gameChangers.filter((n) => n !== oldName), ...(incoming?.gameChanger ? [newName] : [])],
        extraTurns: [...d.bracketCheck.extraTurns.filter((n) => n !== oldName), ...(isExtraTurn(incoming) ? [newName] : [])],
      };
      return { ...d, picks, bracketCheck: check, alternatives: { ...d.alternatives, [cat]: [oldName, ...alts] } };
    });
    setPreviewCard(null);
  }

  // Turns sharing on (and copies the link) or off for one of the person's
  // saved decks.
  async function toggleShare(d) {
    const shared = !d.shared;
    const { error } = await supabase.from("decks").update({ shared }).eq("id", d.id);
    if (error) {
      setShareStatus({ id: d.id, state: "error" });
      return;
    }
    setSavedDecks((prev) => prev.map((x) => (x.id === d.id ? { ...x, shared } : x)));
    if (!shared) {
      setShareStatus({ id: d.id, state: "stopped" });
      return;
    }
    track("deck-shared");
    try {
      await navigator.clipboard.writeText(shareUrl(d.id));
      setShareStatus({ id: d.id, state: "copied" });
    } catch {
      setShareStatus({ id: d.id, state: "shared" });
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

  // Passes a deck's link on: the share sheet on phones, the clipboard
  // elsewhere. Returns what happened, for the button to show.
  async function sendDeckLink(d) {
    const result = await sendLink({ title: `${d.deckName} · ${d.commander} Commander deck`, url: shareUrl(d.id) });
    if (result === "sent" || result === "copied") track("deck-link-sent", { via: result === "sent" ? "share-sheet" : "clipboard" });
    return result;
  }

  // From a shared deck: start a deck of their own with the same commander.
  function brewCommander(name) {
    reset();
    setSearch(name);
    track("brew-from-shared-deck");
  }

  function reset() {
    setSavedNotice(false);
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
              cardLists={cardLists}
              setCardLists={setCardLists}
            />
          )}

          {view === "result" && deck && (
            <ResultView
              addSearchedCard={addSearchedCard}
              addToDeck={addToDeck}
              changePriceSource={changePriceSource}
              evenOutDeck={evenOutDeck}
              loadSuggestedAdditions={loadSuggestedAdditions}
              openMyDecks={() => setView("decks")}
              pricesRefreshing={pricesRefreshing}
              removeFromDeck={removeFromDeck}
              savedNotice={savedNotice}
              suggestionsStatus={suggestionsStatus}
              cardData={cardData}
              cardDataStatus={cardDataStatus}
              copied={copied}
              copyDeck={copyDeck}
              copyError={copyError}
              deck={deck}
              deckTotalPrice={deckTotalPrice}
              openAuthModal={openAuthModal}
              priceSource={priceSource}
              reset={reset}
              session={session}
              setPreviewCard={setPreviewCard}
              setSaveModalOpen={(open) => {
                if (open) setDeckName(deck.savedName || "");
                setSaveModalOpen(open);
              }}
            />
          )}

          {view === "collection" && (
            <CollectionView
              clearCollection={clearCollection}
              collection={collection}
              collectionError={collectionError}
              collectionStatus={collectionStatus}
              commanderCount={ownedCommanderList.length}
              ownedCards={ownedCards}
              setCardQty={setCardQty}
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

          {view === "shared" && (
            <SharedDeckView
              copied={copied}
              copyDeck={copyDeck}
              copyError={copyError}
              brewCommander={brewCommander}
              reset={reset}
              sendDeckLink={sendDeckLink}
              setPreviewCard={setPreviewCard}
              sharedDeck={sharedDeck}
            />
          )}

          {view === "decks" && (
            <MyDecksView
              sendDeckLink={sendDeckLink}
              shareStatus={shareStatus}
              toggleShare={toggleShare}
              copied={copied}
              copyDeck={copyDeck}
              copyError={copyError}
              accountDeleteError={accountDeleteError}
              accountDeleting={accountDeleting}
              decksLoading={decksLoading}
              deleteAccount={deleteAccount}
              deleteDeck={deleteDeck}
              openDeckError={openDeckError}
              openSavedDeck={openSavedDeck}
              openingDeckId={openingDeckId}
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
        <CardPreviewModal
          previewCard={previewCard}
          priceSource={priceSource}
          setPreviewCard={setPreviewCard}
          swapOptions={
            previewCard.swapRole && deck
              ? (deck.alternatives?.[previewCard.swapRole] || []).slice(0, 3).map((n) => cardData[n.toLowerCase()] || { name: n })
              : []
          }
          onSwap={(newName) => swapCard(previewCard.swapRole, previewCard.name, newName)}
          onAdd={previewCard.addRole && deck && !deckHas(deck, previewCard.name) ? () => addToDeck(previewCard.name, previewCard.addRole) : null}
          onRemove={previewCard.inDeck && deck ? () => removeFromDeck(previewCard.name) : null}
        />
      )}
    </div>
  );
}
