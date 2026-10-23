import { describe, expect, it } from "vitest";
import { mapDeckRow, shareUrl, sharedDeckIdFromUrl } from "./shareDeck";

const ID = "3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90";

describe("shareUrl", () => {
  it("always points at the live site", () => {
    expect(shareUrl(ID)).toBe(`https://brewhall.co.uk/?deck=${ID}`);
  });
});

describe("sharedDeckIdFromUrl", () => {
  it("reads the deck id from a share link", () => {
    expect(sharedDeckIdFromUrl(`https://brewhall.co.uk/?deck=${ID.toUpperCase()}`)).toBe(ID);
  });

  it("ignores addresses without a well-formed id", () => {
    expect(sharedDeckIdFromUrl("https://brewhall.co.uk/")).toBeNull();
    expect(sharedDeckIdFromUrl("https://brewhall.co.uk/?deck=1;drop")).toBeNull();
    expect(sharedDeckIdFromUrl("not a url")).toBeNull();
  });
});

describe("mapDeckRow", () => {
  it("treats a missing shared column as not shared", () => {
    expect(mapDeckRow({ id: ID, deck_name: "Elves" }).shared).toBe(false);
    expect(mapDeckRow({ id: ID, shared: true }).shared).toBe(true);
  });
});
