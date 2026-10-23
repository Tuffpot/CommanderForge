import { useEffect, useRef } from "react";
import { ADSENSE_CLIENT, adsEnabled, loadAdSense } from "../lib/ads";

// One display ad unit. VITE_ADSENSE_SLOT is the "data-ad-slot" number of an
// ad unit made under AdSense → Ads → By ad unit. Without it nothing renders;
// AdSense's Auto ads can still place ads by itself once the script loads.
const SLOT = (import.meta.env.VITE_ADSENSE_SLOT || "").trim();

export default function AdSlot({ className = "" }) {
  const pushed = useRef(false);
  const show = adsEnabled() && /^\d+$/.test(SLOT);

  useEffect(() => {
    if (!show || pushed.current) return;
    pushed.current = true;
    loadAdSense();
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // An ad blocker or a not-yet-approved site; leave the space empty.
    }
  }, [show]);

  if (!show) return null;

  return (
    <div className={className}>
      <p className="cf-mono text-[10px] text-parchment/30 tracking-wide mb-1 text-center">ADVERTISEMENT</p>
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={SLOT}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
