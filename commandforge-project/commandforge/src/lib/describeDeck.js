import { houseNameForColors } from "./colors";
import { normalizeThemeKey, singularType, THEME_SUGGESTIONS } from "./queries";

// "Card advantage" gets a plain-English gloss in brackets for newer players.
// One-sentence gameplan for each curated archetype, used when the deck's
// theme isn't what its commander does on its own (a Krenko deck built for
// lifegain), so the commander is named but none of its abilities assumed.
export const ARCHETYPE_BLURBS = {
  aristocrats: "the deck sacrifices its own creatures for value, grinding out advantage every time something dies.",
  tokens: "the deck floods the board with token creatures and looks to go wide for a big combined attack.",
  spellslinger: "the deck chains together cheap instants and sorceries to trigger payoffs and burn through its library.",
  graveyard: "the deck fills its graveyard and recurs threats from it, turning removal into a resource rather than a setback.",
  counters: "the deck piles +1/+1 counters onto its creatures, scaling into a dominant late-game board.",
  wheels: "the deck forces everyone to draw and discard, refilling its own hand while disrupting the table.",
  ninjas: "the deck slips unblocked attackers in and out of combat to chain Ninjutsu triggers and card advantage (more cards in hand and on the board than your opponents).",
  enchantments: "the deck stacks up enchantments for incremental value and powerful constellation-style triggers.",
  bigmana: "the deck ramps hard into a handful of huge threats, aiming to simply outsize the table.",
  lifegain: "the deck gains large amounts of life and turns that life total into a real engine for winning.",
  voltron: "the deck suits up one creature with equipment and auras, then swings for lethal commander damage.",
};

// "Krenko, Mob Boss" -> "Krenko", "Esika, God of the Tree // The Prismatic
// Bridge" -> "Esika". Names without a comma ("Edgar Markov") stay whole.
export function shortCommanderName(name) {
  const front = (name || "").split("//")[0].trim();
  return front.split(",")[0].trim() || "Your commander";
}

// Capitalised words in rules text that aren't creature types, so they're
// never mistaken for a token type or a tribe.
const NOT_A_TRIBE = new Set(["Equipment", "Aura", "Auras", "Vehicle", "Saga", "Treasure", "Food", "Clue", "Blood", "Map", "Powerstone", "Gold", "Shard", "Ninjutsu", "Commander", "Legendary", "Human"]);

// What the commander's own rules text says it does: the token it makes, the
// creature type it leads, what it rewards you with and what sets it off.
// Everything is optional, so a commander with no card text still gets a
// sentence that names it.
export function commanderFacts(commander) {
  const raw = commander?.oracleText || "";
  const names = [commander?.name, shortCommanderName(commander?.name)].filter(Boolean);
  let text = raw;
  for (const n of names) text = text.split(n).join("~");
  text = text.replace(/\bthis creature\b/gi, "~");
  const lower = text.toLowerCase();

  const token = text.match(/[Cc]reate[^.]*?\b(?:\d+\/\d+ )?(?:(?:white|blue|black|red|green|colorless|and),? )*([A-Z][a-z]+(?: [A-Z][a-z]+)?)(?: [a-z]+)*? tokens?\b/);
  const tokenType = token ? token[1] : null;
  const tribeMatch = text.match(/\b(?:other|another|each|attacking|untapped) ([A-Z][a-z]+)\b(?! token)/) || text.match(/\b([A-Z][a-z]+) you control\b/) || text.match(/\b([A-Z][a-z]+) spells? you cast\b/);
  const tribe = tribeMatch && !NOT_A_TRIBE.has(tribeMatch[1]) ? singularType(tribeMatch[1]) : null;

  let payoff = null;
  if (/each opponent loses \w+ life|target opponent loses \w+ life/.test(lower)) payoff = "drain";
  else if (/deals? (?:\w+|that much) damage to (?:each opponent|any target|target opponent|each player|that player)/.test(lower)) payoff = "damage";
  else if (tokenType && /whenever|at the beginning/.test(lower)) payoff = "tokens";
  else if (/put (?:a|an|one|two|three|x|that many) \+1\/\+1 counters? on/.test(lower)) payoff = "counters";
  else if (/draws? (?:a|two|three|x|that many) cards?/.test(lower)) payoff = "draw";

  let trigger = null;
  if (/whenever ~ attacks|whenever ~ enters or attacks/.test(lower)) trigger = "attack";
  else if (/whenever ~ deals combat damage to a player/.test(lower)) trigger = "combat";

  // What the commander cares about when it isn't one of the curated
  // archetypes: the spells it wants cast, or the part of the game it lives in.
  const cast = text.match(/[Ww]henever you cast ((?:an?|another) [^.]+?) spell/);
  let leaning = null;
  if (/your graveyard/.test(lower)) leaning = "graveyard";
  else if (/creature you control dies|another creature dies|creature dying/.test(lower)) leaning = "aristocrats";
  else if (/whenever an opponent draws|each player draws|draws an additional card/.test(lower)) leaning = "wheels";

  return {
    tokenType,
    castTrigger: cast ? `${cast[1]} spell` : null,
    castSpell: cast && !/instant or sorcery/.test(cast[1]) ? `${cast[1]} spell` : null,
    leaning,
    tribe,
    payoff,
    trigger,
    selfNinjutsu: /ninjutsu/.test(lower),
    putsCounters: /put (?:a|an|one|two|three|x|that many) \+1\/\+1 counters? on/.test(lower),
    extraLands: /additional land|extra land|play lands from/.test(lower),
    evasive: /\b(?:flying|trample|menace|can't be blocked|shadow|horsemanship)\b/.test(lower),
  };
}

// The commander's reward, phrased so it can be followed by "whenever …".
function payoffPhrase(f, fallback) {
  switch (f.payoff) {
    case "drain": return "drains every opponent";
    case "damage": return "deals damage to the table";
    case "tokens": return `makes ${f.tokenType} tokens`;
    case "counters": return "spreads +1/+1 counters";
    case "draw": return "draws you cards";
    default: return fallback;
  }
}

const attackTail = (f) => (f.trigger === "attack" ? " every time it attacks" : f.trigger === "combat" ? " whenever it connects" : "");

// One sentence on how the deck plays, written around what the chosen
// commander does. Two commanders that do the same thing read the same way,
// but each sentence still names its own commander and the detail it brings.
const PERSONAL_BLURBS = {
  aristocrats: (n, f) => `${n} ${payoffPhrase(f, "rewards you")} whenever your creatures die, so the deck sacrifices ${f.tokenType ? `${f.tokenType} tokens` : "its own creatures"} again and again to grind out value.`,
  tokens: (n, f) => `${n} ${f.tokenType ? `churns out ${f.tokenType} tokens` : "fills the board with tokens"}${f.castTrigger ? ` every time you cast ${f.castTrigger}` : attackTail(f)}, and the deck goes wide around ${f.tokenType ? "them" : "it"} for one big combined attack.`,
  spellslinger: (n, f) => `${n} ${payoffPhrase(f, "rewards you")} every time you cast an instant or sorcery, so the deck chains cheap spells to keep those triggers coming.`,
  graveyard: (n) => `${n} turns your graveyard into a second hand, so the deck mills and discards on purpose and keeps recurring its best threats.`,
  counters: (n, f) => f.putsCounters
    ? `${n} keeps piling +1/+1 counters onto your creatures${attackTail(f)}, so the deck snowballs into a board nobody else can match.`
    : `${n} rewards every +1/+1 counter you place, so the deck spreads them wide and snowballs into a dominant late-game board.`,
  wheels: (n, f) => `${n} ${f.payoff === "drain" || f.payoff === "damage" ? "punishes opponents for every card they draw" : "thrives on everyone drawing and discarding"}, so the deck wheels hands to refill itself and disrupt the table.`,
  ninjas: (n, f) => f.selfNinjutsu
    ? `${n} sneaks in off any unblocked attacker, so the deck swarms with cheap evasive creatures and swaps Ninjas into combat for card advantage (more cards in hand and on the board than your opponents).`
    : `${n} rewards every unblocked attacker, so the deck slips Ninjas in and out of combat to chain triggers and card advantage (more cards in hand and on the board than your opponents).`,
  enchantments: (n, f) => f.payoff
    ? `${n} ${payoffPhrase(f)} as your enchantments pile up, so the deck stacks enchantments for a steady stream of value.`
    : `${n} grows stronger with every enchantment you control, so the deck stacks them up for incremental value and constellation triggers.`,
  bigmana: (n, f) => `${n} ${f.extraLands ? "puts extra lands into play" : "pulls you ahead on mana"}, so the deck ramps well past the table and then slams the biggest threats it can find.`,
  lifegain: (n, f) => `${n} ${payoffPhrase(f, "rewards you")} whenever you gain life, so the deck stacks lifelink and life-gain triggers until that life total wins the game.`,
  voltron: (n, f) => `${n} is the threat that matters, so the deck suits it up with equipment and auras and ${f.evasive ? "carries it over blockers" : "swings"} for lethal commander damage.`,
};

// A commander whose text doesn't match a curated archetype still gets a
// sentence built from whatever it does: the tribe it leads, or what it
// does when it attacks.
function freeformBlurb(n, f) {
  if (f.castSpell) return `${n} ${payoffPhrase(f, "rewards you")} every time you cast ${f.castSpell}, so the deck is packed with them to keep those triggers coming.`;
  if (f.leaning) return PERSONAL_BLURBS[f.leaning](n, f);
  if (f.tribe) return `${n} leads a ${f.tribe} army, so the deck packs as many ${f.tribe} creatures as it can and wins on the strength of the team.`;
  if (f.trigger && f.payoff) return `${n} ${payoffPhrase(f)}${attackTail(f)}, so the deck protects it and keeps it in combat while the value adds up.`;
  return `${n} anchors a flexible, value-driven game, with the deck developing its board, answering threats and grinding out card advantage (more cards in hand and on the board than your opponents).`;
}

export function strategyBlurb(deck) {
  const commander = deck.commander;
  const n = shortCommanderName(commander.name);
  const f = commanderFacts(commander);
  const themeKey = deck.theme ? normalizeThemeKey(deck.theme) : null;
  const key = themeKey || commander.archetype;
  // The theme is what the commander does anyway (or there is no theme):
  // describe the deck through the commander's own abilities.
  if (key && PERSONAL_BLURBS[key] && (!themeKey || themeKey === commander.archetype || themeKey === "voltron")) {
    return PERSONAL_BLURBS[key](n, f);
  }
  if (key && ARCHETYPE_BLURBS[key]) return `With ${n} at the helm, ${ARCHETYPE_BLURBS[key]}`;
  // A typed tribe the commander leads or makes tokens of ("Goblins" for
  // Krenko) is still the commander's own plan.
  const typed = deck.theme && singularType(deck.theme).toLowerCase();
  if (typed && f.tokenType?.toLowerCase().split(" ").includes(typed)) return PERSONAL_BLURBS.tokens(n, f);
  if (typed && typed === f.tribe?.toLowerCase()) return freeformBlurb(n, { ...f, castSpell: null, leaning: null });
  if (deck.theme) return `With ${n} at the helm, the deck leans into ${/^[aeiou]/i.test(deck.theme.trim()) ? "an" : "a"} ${deck.theme.trim().toLowerCase()} gameplan, built around cards that reinforce that theme.`;
  return freeformBlurb(n, f);
}

// A short name for how the deck plays, for the heading of the result
// screen's playstyle box: the theme or archetype as the theme chips spell
// it, or the typed theme.
export function playstyleName(deck) {
  const key = deck.theme ? normalizeThemeKey(deck.theme) : deck.commander.archetype;
  const chip = key && THEME_SUGGESTIONS.find((s) => normalizeThemeKey(s) === key);
  if (chip) return chip;
  const named = deck.theme?.trim() || key;
  return named ? named.replace(/^./, (c) => c.toUpperCase()) : "Midrange value";
}

// What kind of deck got built: style, commander, bracket and colours.
export function deckOverview(deck) {
  const styleText = deck.fromCollection
    ? `${deck.style === "edhrec" ? "An EDHREC-inspired" : "A"} build from your own collection`
    : deck.style === "edhrec" ? "An EDHREC-inspired build" : "A randomly assembled build";
  const themeText = deck.theme ? ` leaning into a ${deck.theme} theme` : "";
  const colorsText = deck.commander.identity.length
    ? ` in ${houseNameForColors(deck.commander.identity)} colors`
    : " with no color identity";
  return `${styleText} around ${deck.commander.name}${themeText}, aimed at Bracket ${deck.bracket.id} (${deck.bracket.name}) power level${colorsText}.`;
}

// A short, two-sentence summary of what kind of deck just got built and
// roughly how it plays.
export function describeDeck(deck) {
  if (!deck) return "";
  return `${deckOverview(deck)} ${strategyBlurb(deck)}`;
}
