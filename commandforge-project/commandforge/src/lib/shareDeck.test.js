import { describe, expect, it } from "vitest";
import { commanderFromUrl, commanderUrl, mapDeckRow, sendLink, shareUrl, sharedDeckIdFromUrl } from "./shareDeck";

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

describe("commander links", () => {
  it("round-trips a commander's name through a link", () => {
    const name = "Atraxa, Praetors' Voice";
    expect(commanderUrl(name)).toBe("https://brewhall.co.uk/?commander=Atraxa%2C%20Praetors'%20Voice");
    expect(commanderFromUrl(commanderUrl(name))).toBe(name);
  });

  it("ignores pages without one", () => {
    expect(commanderFromUrl("https://brewhall.co.uk/")).toBeNull();
    expect(commanderFromUrl("https://brewhall.co.uk/?commander=%20")).toBeNull();
    expect(commanderFromUrl("not a url")).toBeNull();
  });
});

describe("sendLink", () => {
  const link = { title: "Deck", url: "https://brewhall.co.uk/?deck=x" };
  const clipboard = (ok = true) => ({ writeText: () => (ok ? Promise.resolve() : Promise.reject(new Error("blocked"))) });

  it("uses the share sheet where there is one", async () => {
    let shared = null;
    expect(await sendLink(link, { share: async (d) => { shared = d; }, clipboard: clipboard() })).toBe("sent");
    expect(shared).toEqual(link);
  });

  it("does nothing more when the person closes the share sheet", async () => {
    const abort = Object.assign(new Error("closed"), { name: "AbortError" });
    expect(await sendLink(link, { share: () => Promise.reject(abort), clipboard: clipboard() })).toBe("cancelled");
  });

  it("copies the link without a share sheet, or when it fails", async () => {
    expect(await sendLink(link, { clipboard: clipboard() })).toBe("copied");
    expect(await sendLink(link, { share: () => Promise.reject(new Error("no")), clipboard: clipboard() })).toBe("copied");
    expect(await sendLink(link, { clipboard: clipboard(false) })).toBe("failed");
  });
});
