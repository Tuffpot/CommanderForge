// Colour identities: basic land names, guild/shard house names and swatches.

export const BASIC_LAND = { W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest", C: "Wastes" };

export const HOUSE_NAMES = {
  azorius: ["W", "U"], dimir: ["U", "B"], rakdos: ["B", "R"], gruul: ["R", "G"], selesnya: ["G", "W"],
  orzhov: ["W", "B"], izzet: ["U", "R"], golgari: ["B", "G"], boros: ["R", "W"], simic: ["G", "U"],
  jeskai: ["W", "U", "R"], sultai: ["U", "B", "G"], mardu: ["B", "R", "W"], temur: ["R", "G", "U"], abzan: ["G", "W", "B"],
  bant: ["G", "W", "U"], esper: ["W", "U", "B"], grixis: ["U", "B", "R"], jund: ["B", "R", "G"], naya: ["R", "G", "W"],
  colorless: ["C"], colourless: ["C"],
};

export const SINGLE_COLOR_NAMES = { W: "Mono-White", U: "Mono-Blue", B: "Mono-Black", R: "Mono-Red", G: "Mono-Green", C: "Colorless" };

// Four-color (missing one color) nicknames, from the Ravnica Nephilim cycle
export const FOUR_COLOR_NAMES = {
  W: "Glint (non-White)",
  U: "Dune (non-Blue)",
  B: "Ink (non-Black)",
  R: "Witch (non-Red)",
  G: "Yore (non-Green)",
};

export function houseNameForColors(colors) {
  if (colors.length === 0) return null;
  if (colors.length === 1) return SINGLE_COLOR_NAMES[colors[0]];
  if (colors.length === 4) {
    const missing = ["W", "U", "B", "R", "G"].find((c) => !colors.includes(c));
    return FOUR_COLOR_NAMES[missing];
  }
  if (colors.length >= 5) return "5-Color / Big Mana";
  const sorted = [...colors].sort().join("");
  const match = Object.entries(HOUSE_NAMES).find(([, cols]) => [...cols].sort().join("") === sorted);
  if (match) return match[0][0].toUpperCase() + match[0].slice(1);
  return colors.join("");
}

export const COLOR_META = {
  W: { label: "White", swatch: "#F3E7C9" },
  U: { label: "Blue", swatch: "#8ECBEF" },
  B: { label: "Black", swatch: "#9C8FB5" },
  R: { label: "Red", swatch: "#E38B6B" },
  G: { label: "Green", swatch: "#8FBE8A" },
  C: { label: "Colorless", swatch: "#C9C4CE" },
};
