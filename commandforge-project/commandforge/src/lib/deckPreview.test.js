import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyPreview, artCropUrl, deckPreview } from "./deckPreview";

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const ART = "https://cards.scryfall.io/large/front/d/0/d0d33d52-3d28-4635-b985-51e126289259.jpg?1599707796";
const row = {
  id: ID,
  deck_name: "Phyrexian Counters",
  commander: "Atraxa, Praetors' Voice",
  bracket_name: "Upgraded",
  card_data: { "atraxa, praetors' voice": { imageLarge: ART } },
};

describe("artCropUrl", () => {
  it("points a Scryfall card image at the same card's art", () => {
    expect(artCropUrl(ART)).toBe(ART.replace("/large/", "/art_crop/"));
    expect(artCropUrl("https://cards.scryfall.io/png/front/a/b/ab.png?1")).toBe("https://cards.scryfall.io/art_crop/front/a/b/ab.jpg?1");
  });

  it("ignores anything that isn't a Scryfall card image", () => {
    expect(artCropUrl(null)).toBeNull();
    expect(artCropUrl("https://example.com/large/x.jpg")).toBeNull();
  });
});

describe("deckPreview", () => {
  it("names the deck and commander and uses the commander's art", () => {
    const p = deckPreview(row);
    expect(p.title).toBe("Phyrexian Counters · Atraxa, Praetors' Voice Commander deck");
    expect(p.description).toContain("A Commander deck led by Atraxa, Praetors' Voice, built for the Upgraded bracket.");
    expect(p.image).toContain("/art_crop/");
    expect(p.url).toBe(`https://brewhall.co.uk/?deck=${ID}`);
  });

  it("falls back to the site image when the commander's art isn't saved", () => {
    expect(deckPreview({ ...row, card_data: {} }).image).toBe("https://brewhall.co.uk/og-image.png");
  });
});

describe("applyPreview", () => {
  const page = readFileSync(new URL("../../index.html", import.meta.url), "utf8");

  it("swaps every site-wide preview tag in index.html for the deck's", () => {
    const html = applyPreview(page, deckPreview({ ...row, deck_name: 'Tom & "Jerry" <3' }));
    expect(html).toContain("<title>Tom &amp; &quot;Jerry&quot; &lt;3 · Atraxa, Praetors' Voice Commander deck</title>");
    expect(html).toContain(`<meta property="og:url" content="https://brewhall.co.uk/?deck=${ID}" />`);
    expect(html).toContain(`<link rel="canonical" href="https://brewhall.co.uk/?deck=${ID}" />`);
    expect(html).toContain(`<meta property="og:image" content="${ART.replace("/large/", "/art_crop/")}" />`);
    expect(html).toContain(`<meta name="twitter:image" content="${ART.replace("/large/", "/art_crop/")}" />`);
    expect(html).not.toContain("og:image:width");
    expect(html.match(/Commander deck led by/g)).toHaveLength(3);
  });
});
