import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
const manifest = JSON.parse(readFileSync(publicDir + "manifest.webmanifest", "utf8"));

// Browsers only offer "Install app" / "Add to Home Screen" when these are right.
describe("web app manifest", () => {
  it("has the fields browsers need to offer install", () => {
    expect(manifest.name).toBeTruthy();
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
  });

  it("lists 192px and 512px icons, plus a maskable one", () => {
    const sizes = manifest.icons.map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(manifest.icons.some((i) => i.purpose === "maskable")).toBe(true);
  });

  it("points at icon files that exist", () => {
    for (const icon of manifest.icons) {
      expect(existsSync(publicDir + icon.src.replace(/^\//, ""))).toBe(true);
    }
  });
});
