import { Capacitor } from "@capacitor/core";

// Visitor counts and a few key actions, from Umami (umami.is). Switched on by
// setting VITE_UMAMI_WEBSITE_ID (the website ID from Umami's dashboard) in
// Netlify's environment variables. Umami sets no cookies and stores nothing
// that identifies a visitor, so it needs no consent banner. With the ID unset
// nothing is loaded and track() does nothing.
export const UMAMI_WEBSITE_ID = (import.meta.env.VITE_UMAMI_WEBSITE_ID || "").trim();
const UMAMI_SCRIPT = (import.meta.env.VITE_UMAMI_SCRIPT || "https://cloud.umami.is/script.js").trim();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Website only for now: counting app users would change what the app store
// listings have to declare.
export function analyticsEnabled(websiteId = UMAMI_WEBSITE_ID, isNative = Capacitor.isNativePlatform()) {
  return UUID.test(websiteId) && !isNative;
}

let loaded = false;
// Actions recorded before Umami's script has arrived, sent once it has.
let waiting = [];

export function loadAnalytics() {
  if (loaded || !analyticsEnabled()) return;
  loaded = true;
  const script = document.createElement("script");
  script.defer = true;
  script.src = UMAMI_SCRIPT;
  script.dataset.websiteId = UMAMI_WEBSITE_ID;
  // Shared deck links all count as visits to the home page, not one page each.
  script.dataset.excludeSearch = "true";
  script.onload = () => {
    const queued = waiting;
    waiting = [];
    queued.forEach(([event, details]) => track(event, details));
  };
  document.head.appendChild(script);
}

// Records one action, such as "deck-built". Details are short labels like a
// bracket or an export target, never anything about the person.
export function track(event, details) {
  if (!loaded) return;
  if (!window.umami) {
    if (waiting.length < 20) waiting.push([event, details]);
    return;
  }
  try {
    window.umami.track(event, details);
  } catch {
    // Analytics must never get in the way of using the site.
  }
}
