import { Loader2, LogOut, User } from "lucide-react";

function NavButton({ active, children, ...props }) {
  return (
    <button
      {...props}
      aria-current={active ? "page" : undefined}
      className={`relative px-3 sm:px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition ${
        active ? "text-brass" : "text-parchment/65 hover:text-parchment"
      }`}
    >
      {children}
      {active && <span className="absolute left-3 right-3 sm:left-4 sm:right-4 -bottom-0.5 h-px bg-brass/70" />}
    </button>
  );
}

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
    <header className="bg-ink/85 backdrop-blur border-b border-brass/15 sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-4 sm:px-5 py-3.5 flex items-center justify-between gap-2 sm:gap-4">
        <button onClick={reset} className="flex items-center gap-2.5 shrink-0" aria-label="Brewhall home">
          <img src="/logo.svg" alt="" width={36} height={36} className="w-9 h-9 shrink-0" />
          <span className="cf-display text-xl font-semibold text-parchment whitespace-nowrap hidden sm:inline">Brewhall</span>
        </button>
        <div className="flex items-center gap-1 sm:gap-2 min-w-0">
          <nav className="flex items-center">
            <NavButton active={view === "setup" || view === "result"} onClick={() => setView("setup")}>
              Brew
            </NavButton>
            <NavButton
              active={view === "collection"}
              onClick={() => setView("collection")}
              title={collectionCount ? `${collectionCount} different cards` : "Import your card collection"}
            >
              Collection
            </NavButton>
            <NavButton active={view === "decks"} onClick={() => setView("decks")}>
              <span className="sm:hidden">Decks</span>
              <span className="hidden sm:inline">My decks</span>
              {savedDecks.length > 0 ? ` (${savedDecks.length})` : ""}
            </NavButton>
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
              className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold text-parchment/65 hover:text-parchment transition"
            >
              <User size={14} />
              <span className="hidden sm:inline max-w-[120px] truncate">{session.user.email}</span>
              <LogOut size={13} />
            </button>
          ) : (
            <button
              onClick={() => openAuthModal()}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap shrink-0 border border-brass/40 text-parchment/85 hover:border-brass/70 hover:text-parchment transition"
            >
              <User size={14} /> Sign in
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
