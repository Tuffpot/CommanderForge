import { houseNameForColors } from "./colors";
import { normalizeThemeKey } from "./queries";

// One-sentence gameplan for each curated archetype, used as the second
// sentence of the deck description. Free-typed themes that don't match one
// of these fall back to a generic line that still names the theme.
export const ARCHETYPE_BLURBS = {
  aristocrats: "It sacrifices its own creatures for value, grinding out advantage every time something dies.",
  tokens: "It floods the board with token creatures and looks to go wide for a big combined attack.",
  spellslinger: "It chains together cheap instants and sorceries to trigger payoffs and burn through the deck.",
  graveyard: "It fills its graveyard and recurs threats from it, turning removal spells into a resource rather than a setback.",
  counters: "It piles +1/+1 counters onto its creatures, scaling into a dominant late-game board.",
  wheels: "It forces everyone to draw and discard, refilling its own hand while disrupting the rest of the table.",
  ninjas: "It slips unblocked attackers in and out of combat to chain Ninjutsu triggers and card advantage.",
  enchantments: "It stacks up enchantments for incremental value and powerful constellation-style triggers.",
  bigmana: "It ramps hard into a handful of huge threats, aiming to simply outsize the table.",
  lifegain: "It gains large amounts of life and turns that life total into a real engine for winning the game.",
  voltron: "It suits up one creature with equipment and auras, then swings for lethal commander damage.",
};

export function strategyBlurb(deck) {
  const key = deck.theme ? normalizeThemeKey(deck.theme) : deck.commander.archetype;
  if (key && ARCHETYPE_BLURBS[key]) return ARCHETYPE_BLURBS[key];
  if (deck.theme) return `It leans into a ${deck.theme.toLowerCase()} gameplan, built around cards that reinforce that theme.`;
  return "It plays a flexible, value-driven game — developing its board, answering threats, and grinding out card advantage along the way.";
}

// A short, two-sentence summary of what kind of deck just got built and
// roughly how it plays, shown at the top of the result screen.
export function describeDeck(deck) {
  if (!deck) return "";
  const styleText = deck.style === "edhrec" ? "An EDHREC-inspired build" : "A randomly assembled build";
  const themeText = deck.theme ? ` leaning into a ${deck.theme} theme` : "";
  const colorsText = deck.commander.identity.length
    ? ` in ${houseNameForColors(deck.commander.identity)} colors`
    : " with no color identity";
  const overview = `${styleText} around ${deck.commander.name}${themeText}, aimed at Bracket ${deck.bracket.id} (${deck.bracket.name}) power level${colorsText}.`;
  return `${overview} ${strategyBlurb(deck)}`;
}
