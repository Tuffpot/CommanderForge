import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";

// "Continue with Google / Apple" sign-in, run by Supabase. Each button only
// shows once its provider is switched on in the Supabase dashboard
// (Authentication → Sign In / Providers), so the site is safe to deploy first.
export const OAUTH_PROVIDERS = [
  { id: "google", label: "Google" },
  { id: "apple", label: "Apple" },
];

// The Android and iOS apps can't be sent back to a web address after signing
// in, so Supabase sends them to this app link instead. It must also be in
// Supabase's list of allowed Redirect URLs.
export const NATIVE_REDIRECT_URL = "uk.co.commanderforge.app://auth-callback";

// Supabase's public settings say which providers are switched on.
export async function fetchEnabledProviders(supabaseUrl, anonKey, fetchFn = fetch) {
  if (!supabaseUrl || !anonKey) return [];
  try {
    const res = await fetchFn(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: anonKey } });
    if (!res.ok) return [];
    const { external = {} } = await res.json();
    return OAUTH_PROVIDERS.filter((p) => external[p.id] === true).map((p) => p.id);
  } catch {
    return [];
  }
}

// On the website this leaves the page for Google or Apple, which send the
// person back here signed in. In the apps it opens an in-app browser and
// waitForNativeSignIn picks up the result.
export async function startOAuthSignIn(supabase, provider, isNative = Capacitor.isNativePlatform()) {
  if (!isNative) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
    return;
  }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: NATIVE_REDIRECT_URL, skipBrowserRedirect: true },
  });
  if (error) throw error;
  await Browser.open({ url: data.url });
}

// Reads the sign-in result from the app link Supabase sends the app back to:
// either the session tokens or an error message.
export function parseOAuthCallback(url) {
  if (!url || !url.startsWith(NATIVE_REDIRECT_URL)) return null;
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.hash.replace(/^#/, ""));
  for (const [key, value] of parsed.searchParams) {
    if (!params.has(key)) params.set(key, value);
  }
  const error = params.get("error_description") || params.get("error");
  if (error) return { error };
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) return { error: "Sign-in didn't finish. Please try again." };
  return { accessToken, refreshToken };
}

// In the apps, listens for the app link and signs in with its tokens.
// Returns a function that stops listening.
export function waitForNativeSignIn(supabase, onError) {
  if (!Capacitor.isNativePlatform()) return () => {};
  const handle = App.addListener("appUrlOpen", async ({ url }) => {
    const result = parseOAuthCallback(url);
    if (!result) return;
    Browser.close().catch(() => {});
    if (result.error) {
      onError(result.error);
      return;
    }
    const { error } = await supabase.auth.setSession({
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
    });
    if (error) onError(error.message);
  });
  return () => handle.then((h) => h.remove());
}
