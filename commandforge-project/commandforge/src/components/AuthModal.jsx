import { Loader2, X } from "lucide-react";
import { OAUTH_PROVIDERS } from "../lib/oauth";

function GoogleLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function AppleLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 384 512" aria-hidden="true" fill="currentColor">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  );
}

const PROVIDER_STYLES = {
  google: { logo: <GoogleLogo />, className: "bg-white text-gray-800 hover:bg-gray-100" },
  apple: { logo: <AppleLogo />, className: "bg-black text-white border border-white/25 hover:bg-white/10" },
};

export default function AuthModal({
  authEmail,
  authError,
  authMode,
  authNotice,
  authPassword,
  authSubmitting,
  handleAuthSubmit,
  handleOAuthSignIn,
  oauthProviders = [],
  setAuthEmail,
  setAuthError,
  setAuthModalOpen,
  setAuthMode,
  setAuthNotice,
  setAuthPassword,
}) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 sm:p-6 z-20 overflow-y-auto" onClick={() => setAuthModalOpen(false)}>
      <div className="cf-panel rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="cf-display text-lg text-white">{authMode === "signup" ? "Create Account" : "Sign In"}</h3>
          <button onClick={() => setAuthModalOpen(false)} className="-m-2 p-2 text-white/40 hover:text-white transition" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => { setAuthMode("signin"); setAuthError(""); setAuthNotice(""); }}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${
              authMode === "signin" ? "bg-purple-500/20 text-white border border-purple-400/50" : "text-white/50 border border-white/10"
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => { setAuthMode("signup"); setAuthError(""); setAuthNotice(""); }}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${
              authMode === "signup" ? "bg-purple-500/20 text-white border border-purple-400/50" : "text-white/50 border border-white/10"
            }`}
          >
            Create Account
          </button>
        </div>

        {oauthProviders.length > 0 && (
          <>
            <div className="flex flex-col gap-2">
              {OAUTH_PROVIDERS.filter((p) => oauthProviders.includes(p.id)).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleOAuthSignIn(p.id)}
                  className={`w-full py-2.5 rounded-xl font-semibold text-sm transition flex items-center justify-center gap-2 ${PROVIDER_STYLES[p.id].className}`}
                >
                  {PROVIDER_STYLES[p.id].logo}
                  Continue with {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 my-4 text-[11px] uppercase tracking-wider text-white/35">
              <span className="flex-1 h-px bg-white/10" />
              or use email
              <span className="flex-1 h-px bg-white/10" />
            </div>
          </>
        )}

        <form onSubmit={handleAuthSubmit}>
          <input
            type="email"
            required
            value={authEmail}
            onChange={(e) => setAuthEmail(e.target.value)}
            placeholder="Email"
            className="w-full bg-black/40 border border-white/15 rounded-xl px-3 py-2.5 text-base sm:text-sm text-white placeholder-white/35 mb-2 outline-none focus:border-purple-400/60"
          />
          <input
            type="password"
            required
            minLength={6}
            value={authPassword}
            onChange={(e) => setAuthPassword(e.target.value)}
            placeholder="Password"
            className="w-full bg-black/40 border border-white/15 rounded-xl px-3 py-2.5 text-base sm:text-sm text-white placeholder-white/35 mb-3 outline-none focus:border-purple-400/60"
          />

          {authNotice && <p className="text-xs cf-gold mb-3">{authNotice}</p>}
          {authError && <p className="text-xs text-red-300/80 mb-3">{authError}</p>}

          <button
            type="submit"
            disabled={authSubmitting}
            className="w-full py-2.5 rounded-xl border-2 border-purple-400/60 bg-purple-500/15 hover:bg-purple-500/25 disabled:opacity-50 text-white font-semibold text-sm transition flex items-center justify-center gap-2"
          >
            {authSubmitting && <Loader2 size={14} className="animate-spin" />}
            {authMode === "signup" ? "Create Account" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
