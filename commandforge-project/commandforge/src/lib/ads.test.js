import { describe, it, expect } from "vitest";
import { adsEnabled } from "./ads";
import { adsenseFiles } from "./adsenseFiles";

describe("AdSense switch", () => {
  it("stays off until a real publisher ID is set", () => {
    expect(adsEnabled("", false)).toBe(false);
    expect(adsEnabled("pub-123", false)).toBe(false);
    expect(adsEnabled("ca-pub-123", false)).toBe(true);
  });

  it("stays off inside the Android and iOS apps", () => {
    expect(adsEnabled("ca-pub-123", true)).toBe(false);
  });
});

describe("AdSense site files", () => {
  it("writes the ads.txt line and meta tag from the publisher ID", () => {
    const files = adsenseFiles(" ca-pub-1234567890 ");
    expect(files.adsTxt).toBe("google.com, pub-1234567890, DIRECT, f08c47fec0942fa0\n");
    expect(files.metaTag).toBe('<meta name="google-adsense-account" content="ca-pub-1234567890" />');
  });

  it("adds nothing without a valid ID", () => {
    expect(adsenseFiles(undefined)).toBeNull();
    expect(adsenseFiles("ca-pub-<script>")).toBeNull();
  });
});
