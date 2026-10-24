import { describe, expect, it } from "vitest";
import { analyticsEnabled, track } from "./analytics";

describe("analytics switch", () => {
  it("stays off until a real Umami website ID is set", () => {
    expect(analyticsEnabled("", false)).toBe(false);
    expect(analyticsEnabled("not-an-id", false)).toBe(false);
    expect(analyticsEnabled("94db1cb1-74f4-4a40-ad6c-962362670409", false)).toBe(true);
  });

  it("stays off inside the Android and iOS apps", () => {
    expect(analyticsEnabled("94db1cb1-74f4-4a40-ad6c-962362670409", true)).toBe(false);
  });

  it("does nothing when it isn't loaded", () => {
    expect(() => track("deck-built")).not.toThrow();
  });
});
