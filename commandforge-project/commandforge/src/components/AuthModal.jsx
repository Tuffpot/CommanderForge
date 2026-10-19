import { Loader2, X } from "lucide-react";

export default function AuthModal({
  authEmail,
  authError,
  authMode,
  authNotice,
  authPassword,
  authSubmitting,
  handleAuthSubmit,
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
