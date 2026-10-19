import { Capacitor } from "@capacitor/core";

// Google AdSense, switched on by setting VITE_ADSENSE_CLIENT (the "ca-pub-…"
// publisher ID from the AdSense dashboard) in Netlify's environment
// variables. With it unset the site shows no ads and loads nothing from
// Google, so it's safe to deploy before AdSense has approved the site.
//
// UK and EU visitors are asked for cookie consent by Google's own consent
// message (AdSense → Privacy & messaging), which this same script shows. That
// message is a Google-certified consent tool, which AdSense requires for
// personalised ads in the UK, so the site doesn't need a banner of its own.
export const ADSENSE_CLIENT = (import.meta.env.VITE_ADSENSE_CLIENT || "").trim();

// AdSense is for websites only; showing it inside the Android or iOS app
// breaks its rules (apps use AdMob instead).
export function adsEnabled(client = ADSENSE_CLIENT, isNative = Capacitor.isNativePlatform()) {
  return /^ca-pub-\d+$/.test(client) && !isNative;
}

let loaded = false;

export function loadAdSense() {
  if (loaded || !adsEnabled()) return;
  loaded = true;
  const script = document.createElement("script");
  script.async = true;
  script.crossOrigin = "anonymous";
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
  document.head.appendChild(script);
}

// Reopens Google's consent message so visitors can change their cookie
// choice later, as UK rules require it to be as easy to withdraw as to give.
export function showCookieSettings() {
  window.googlefc = window.googlefc || {};
  window.googlefc.callbackQueue = window.googlefc.callbackQueue || [];
  window.googlefc.callbackQueue.push(() => window.googlefc.showRevocationMessage());
}
