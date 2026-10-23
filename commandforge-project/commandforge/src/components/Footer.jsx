import { adsEnabled, showCookieSettings } from "../lib/ads";
import Star from "./Star";

export default function Footer() {
  return (
    <footer className="max-w-3xl mx-auto px-4 sm:px-5 pb-10 pt-6 text-center">
      <div className="cf-rule mb-6" aria-hidden="true">
        <Star />
      </div>
      <p className="text-sm text-parchment/60 mb-3 leading-relaxed">
        Brewhall is a small, independent project made in the UK.
        <br className="hidden sm:inline" /> Found a bug, or a deck that came out strange?{" "}
        <a href="mailto:hello@brewhall.co.uk" className="cf-link">hello@brewhall.co.uk</a>
      </p>
      <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-parchment/50 mb-4">
        <a href="/privacy.html" className="hover:text-parchment/80 underline-offset-2 hover:underline">
          Privacy &amp; cookies
        </a>
        {adsEnabled() && (
          <button onClick={showCookieSettings} className="hover:text-parchment/80 underline-offset-2 hover:underline">
            Cookie settings
          </button>
        )}
      </nav>
      {/* Wording required by Wizards of the Coast's Fan Content Policy. */}
      <p className="text-[11px] text-parchment/35 leading-relaxed">
        Brewhall is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by
        Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.
        Card data and images from Scryfall.
      </p>
    </footer>
  );
}
