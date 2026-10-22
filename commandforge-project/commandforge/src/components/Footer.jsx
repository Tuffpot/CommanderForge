import { adsEnabled, showCookieSettings } from "../lib/ads";

export default function Footer() {
  return (
    <footer className="max-w-3xl mx-auto px-4 sm:px-5 pb-10 pt-2 text-center">
      <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-white/50 mb-3">
        <a href="/privacy.html" className="hover:text-white/80 underline-offset-2 hover:underline">
          Privacy &amp; cookies
        </a>
        {adsEnabled() && (
          <button onClick={showCookieSettings} className="hover:text-white/80 underline-offset-2 hover:underline">
            Cookie settings
          </button>
        )}
      </nav>
      {/* Wording required by Wizards of the Coast's Fan Content Policy. */}
      <p className="text-[11px] text-white/35 leading-relaxed">
        Brewhall is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by
        Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.
        Card data and images from Scryfall.
      </p>
    </footer>
  );
}
