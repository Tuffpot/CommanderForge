import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
const guides = readdirSync(publicDir + "guides").filter((f) => f.endsWith(".html"));
const sitemap = readFileSync(publicDir + "sitemap.xml", "utf8");

// The guide pages are plain HTML, so nothing else catches a broken link or a
// page left out of the sitemap.
describe("guide pages", () => {
  it.each(guides)("%s is in the sitemap and links only to pages that exist", (file) => {
    const path = file === "index.html" ? "guides/" : `guides/${file}`;
    expect(sitemap).toContain(`<loc>https://brewhall.co.uk/${path}</loc>`);
    const html = readFileSync(publicDir + "guides/" + file, "utf8");
    const links = [...html.matchAll(/href="(\/[^"#]*)/g)].map((m) => m[1]);
    for (const link of links) {
      if (link === "/") continue;
      const target = link.endsWith("/") ? link + "index.html" : link;
      expect(existsSync(publicDir + target.slice(1)), `${file} links to ${link}`).toBe(true);
    }
  });
});
