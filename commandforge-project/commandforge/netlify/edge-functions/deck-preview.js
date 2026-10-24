import { sharedDeckIdFromUrl } from "../../src/lib/shareDeck.js";
import { applyPreview, deckPreview } from "../../src/lib/deckPreview.js";

// Gives a shared deck link (https://brewhall.co.uk/?deck=<id>) its own link
// preview: the deck's name, its commander and the commander's art, instead
// of the site-wide one. Every other request passes straight through.
export default async (request, context) => {
  const deckId = sharedDeckIdFromUrl(request.url);
  if (!deckId) return context.next();

  const page = await context.next();
  const supabaseUrl = Netlify.env.get("VITE_SUPABASE_URL");
  const anonKey = Netlify.env.get("VITE_SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey || !page.headers.get("content-type")?.includes("text/html")) return page;

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/get_shared_deck`, {
      method: "POST",
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ deck_id: deckId }),
      signal: AbortSignal.timeout(3000),
    });
    const rows = res.ok ? await res.json() : [];
    const row = Array.isArray(rows) ? rows[0] : null;
    // An unshared or deleted deck keeps the site-wide preview.
    if (!row) return page;

    const html = applyPreview(await page.text(), deckPreview(row));
    const headers = new Headers(page.headers);
    headers.delete("content-length");
    return new Response(html, { status: page.status, headers });
  } catch {
    return page;
  }
};

export const config = { path: "/" };
