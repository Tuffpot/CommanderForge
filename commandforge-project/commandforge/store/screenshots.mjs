// Makes the Google Play store images from the live site:
//   feature-graphic.png  1024x500 banner
//   phone-1.png ...      1080x1920 phone screenshots
// Run by .github/workflows/store-images.yml, which uploads them for download.
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const SITE = process.env.SITE_URL || "https://brewhall.co.uk";
const out = fileURLToPath(new URL("./out/", import.meta.url));
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();

// Banner
const banner = await browser.newPage({ viewport: { width: 1024, height: 500 } });
await banner.goto(new URL("./feature-graphic.html", import.meta.url).href);
await banner.waitForLoadState("networkidle");
await banner.evaluate(() => document.fonts.ready);
await banner.screenshot({ path: out + "feature-graphic.png" });

// Phone screenshots: 360x640 at 3x is 1080x1920, within Play's 2:1 limit.
const phone = await browser.newContext({
  viewport: { width: 360, height: 640 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
// Store screenshots should show the app, not ads or the ad consent message.
await phone.route(/googlesyndication|doubleclick|fundingchoicesmessages|adservice\.google|googletagmanager/, (r) => r.abort());
const page = await phone.newPage();
const shot = async (n) => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}phone-${n}.png` });
};
const tidy = () => page.addStyleTag({ content: "div:has(> ins.adsbygoogle) { display: none !important; }" });

// 1. The brew page.
await page.goto(SITE, { waitUntil: "networkidle" });
await tidy();
await shot(1);

// 2-4. A finished deck for a well-known commander.
await page.goto(`${SITE}/?commander=${encodeURIComponent(process.env.COMMANDER || "Atraxa, Praetors' Voice")}`, {
  waitUntil: "networkidle",
});
await tidy();
await page.getByRole("button", { name: /Core/ }).first().click();
await page.getByRole("button", { name: "Brew this deck" }).click();
await page.getByText("Brewing…").first().waitFor({ state: "detached", timeout: 120_000 }).catch(() => {});
await page.waitForLoadState("networkidle");
await page.evaluate(() => window.scrollTo(0, 0));
await shot(2);
await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.9));
await shot(3);
await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.8));
await shot(4);

await browser.close();
console.log("Saved to", out);
