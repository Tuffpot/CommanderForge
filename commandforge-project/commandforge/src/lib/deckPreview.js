import { SITE_URL, shareUrl } from "./shareDeck.js";

// What a shared deck link shows when it's pasted into Discord, Reddit,
// WhatsApp and the like. Those sites read the page's tags without running
// the app, so netlify/edge-functions/deck-preview.js writes these into the
// page before it's sent.

const DEFAULT_IMAGE = `${SITE_URL}/og-image.png`;

// Scryfall serves a card's art on its own (no frame or text) at the same
// address as its other images, with "art_crop" in place of the size. That's
// landscape, so it fills a link preview where the whole card wouldn't.
export function artCropUrl(imageUrl) {
  if (typeof imageUrl !== "string" || !imageUrl.startsWith("https://cards.scryfall.io/")) return null;
  if (imageUrl.includes("/art_crop/")) return imageUrl;
  if (!/\/(small|normal|large|png|border_crop)\//.test(imageUrl)) return null;
  return imageUrl.replace(/\/(small|normal|large|png|border_crop)\//, "/art_crop/").replace(/\.png(\?|$)/, ".jpg$1");
}

// The title, text, image and address for one get_shared_deck row.
export function deckPreview(row) {
  const commander = row.commander || "a commander";
  const name = row.deck_name || `${commander} deck`;
  const entry = row.card_data?.[commander.toLowerCase()];
  const art = artCropUrl(entry?.imageLarge) || artCropUrl(entry?.imageSmall);
  return {
    title: `${name} · ${commander} Commander deck`,
    description: `A Commander deck led by ${commander}${row.bracket_name ? `, built for the ${row.bracket_name} bracket` : ""}. See the full list, copy it to Moxfield or Archidekt, or brew your own on Brewhall.`,
    image: art || DEFAULT_IMAGE,
    imageAlt: art ? `Art from ${commander}` : "Brewhall",
    url: shareUrl(row.id),
  };
}

function escapeAttr(text) {
  return String(text).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Swaps the site-wide preview tags in index.html for a deck's own. Tags the
// page doesn't have are left alone rather than added.
export function applyPreview(html, preview) {
  const set = (attr, key, value) => {
    const tag = new RegExp(`(<meta ${attr}="${key}" content=")[^"]*(")`);
    html = html.replace(tag, `$1${escapeAttr(value)}$2`);
  };
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeAttr(preview.title)}</title>`);
  html = html.replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${escapeAttr(preview.url)}$2`);
  set("name", "description", preview.description);
  set("property", "og:url", preview.url);
  set("property", "og:title", preview.title);
  set("property", "og:description", preview.description);
  set("property", "og:image", preview.image);
  set("property", "og:image:alt", preview.imageAlt);
  set("name", "twitter:title", preview.title);
  set("name", "twitter:description", preview.description);
  set("name", "twitter:image", preview.image);
  // The site image's size doesn't describe the commander's art.
  if (preview.image !== DEFAULT_IMAGE) {
    html = html.replace(/\s*<meta property="og:image:(width|height)" content="[^"]*" \/>/g, "");
  }
  return html;
}
