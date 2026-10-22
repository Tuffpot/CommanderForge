import { Loader2, LogOut, User } from "lucide-react";

export default function Header({
  authLoading,
  collectionCount,
  handleSignOut,
  openAuthModal,
  reset,
  savedDecks,
  session,
  setView,
  view,
}) {
  return (
    <header className="bg-black border-b border-white/10 sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-4 sm:px-5 py-4 flex items-center justify-between gap-2 sm:gap-4">
        <button onClick={reset} className="flex items-center gap-3 shrink-0" aria-label="Brewhall home">
          <img src="/logo.svg" alt="" width={40} height={40} className="w-10 h-10 shrink-0" />
          <span className="cf-display text-lg text-white whitespace-nowrap hidden sm:inline">Brewhall</span>
        </button>
        <div className="flex items-center gap-1 sm:gap-2 min-w-0">
          <nav className="flex items-center gap-1">
            <button
              onClick={() => setView("setup")}
              className={`px-3 sm:px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition ${
                view === "setup" || view === "result" ? "bg-[#E3B25C] text-black" : "text-white/70 hover:text-white"
              }`}
            >
              Brew
            </button>
            <button
              onClick={() => setView("collection")}
              title={collectionCount ? `${collectionCount} different cards` : "Import your card collection"}
              className={`px-3 sm:px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition ${
                view === "collection" ? "bg-[#E3B25C] text-black" : "text-white/70 hover:text-white"
              }`}
            >
              Collection
            </button>
            <button
              onClick={() => setView("decks")}
              className={`px-3 sm:px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition ${
                view === "decks" ? "bg-[#E3B25C] text-black" : "text-white/70 hover:text-white"
              }`}
            >
              <span className="sm:hidden">Decks</span>
              <span className="hidden sm:inline">My Decks</span>
              {savedDecks.length > 0 ? ` (${savedDecks.length})` : ""}
            </button>
          </nav>
          <div className="w-px h-6 bg-white/15 mx-1 hidden sm:block" />
          {authLoading ? (
            <Loader2 size={16} className="animate-spin text-white/30" />
          ) : session ? (
            <button
              onClick={() => {
                // On a phone this is a lone icon with no email beside it,
                // so a tap meant to check the account shouldn't sign out.
                if (window.confirm(`Sign out of ${session.user.email}?`)) handleSignOut();
              }}
              title={session.user.email}
              aria-label="Sign out"
              className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold text-white/70 hover:text-white transition"
            >
              <User size={14} />
              <span className="hidden sm:inline max-w-[120px] truncate">{session.user.email}</span>
              <LogOut size={13} />
            </button>
          ) : (
            <button
              onClick={() => openAuthModal()}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap shrink-0 border border-white/20 text-white/80 hover:border-white/40 hover:text-white transition"
            >
              <User size={14} /> Sign In
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
