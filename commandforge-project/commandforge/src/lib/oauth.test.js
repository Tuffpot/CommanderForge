import { describe, it, expect, vi } from "vitest";
import { fetchEnabledProviders, parseOAuthCallback, NATIVE_REDIRECT_URL } from "./oauth";

function fakeFetch(body, ok = true) {
  return vi.fn(async () => ({ ok, json: async () => body }));
}

describe("Social sign-in buttons", () => {
  it("only shows providers switched on in Supabase", async () => {
    const fetchFn = fakeFetch({ external: { email: true, google: true, apple: false, github: true } });
    expect(await fetchEnabledProviders("https://x.supabase.co", "key", fetchFn)).toEqual(["google"]);
    expect(fetchFn).toHaveBeenCalledWith("https://x.supabase.co/auth/v1/settings", { headers: { apikey: "key" } });
  });

  it("shows none when Supabase can't be reached or isn't set up", async () => {
    expect(await fetchEnabledProviders("", "", fakeFetch({}))).toEqual([]);
    expect(await fetchEnabledProviders("https://x.supabase.co", "key", fakeFetch({}, false))).toEqual([]);
    const failing = vi.fn(async () => { throw new Error("offline"); });
    expect(await fetchEnabledProviders("https://x.supabase.co", "key", failing)).toEqual([]);
  });
});

describe("App sign-in link", () => {
  it("reads the session tokens", () => {
    const url = `${NATIVE_REDIRECT_URL}#access_token=abc&refresh_token=def&token_type=bearer`;
    expect(parseOAuthCallback(url)).toEqual({ accessToken: "abc", refreshToken: "def" });
  });

  it("reads an error", () => {
    const url = `${NATIVE_REDIRECT_URL}?error=access_denied&error_description=User+cancelled`;
    expect(parseOAuthCallback(url)).toEqual({ error: "User cancelled" });
  });

  it("ignores other links", () => {
    expect(parseOAuthCallback("https://brewhall.co.uk/#access_token=abc")).toBeNull();
    expect(parseOAuthCallback(undefined)).toBeNull();
  });
});
