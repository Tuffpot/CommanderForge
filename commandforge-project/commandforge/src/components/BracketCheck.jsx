import { AlertTriangle, Check } from "lucide-react";

// How the finished deck lines up with the official rules for its bracket.
export default function BracketCheck({ bracket, check }) {
  if (!check) return null;
  const rows = [];
  const gcCount = check.gameChangers.length;

  if (check.commanderOverLimit) {
    rows.push({ ok: false, text: `Your commander is a Game Changer, so by the official rules this deck plays at bracket 3 or higher. The 99 have none.` });
  } else if (check.gameChangerLimit === Infinity) {
    rows.push({ ok: true, text: `Game Changers: any number allowed${gcCount ? `, ${gcCount} in this deck` : ""}.` });
  } else if (check.gameChangerLimit === 0) {
    rows.push({ ok: true, text: "No Game Changers, as this bracket requires." });
  } else {
    rows.push({ ok: true, text: `Game Changers: ${gcCount} of the ${check.gameChangerLimit} allowed${gcCount ? ` (${check.gameChangers.join(", ")})` : ""}.` });
  }

  rows.push({ ok: true, text: check.massLandDenialAllowed ? "Mass land denial allowed." : "No mass land denial." });

  if (check.extraTurnLimit === Infinity) rows.push({ ok: true, text: "Extra turns allowed." });
  else if (!check.extraTurns.length) rows.push({ ok: true, text: "No extra-turn cards." });
  else rows.push({ ok: true, text: `One extra-turn card, so it can't chain: ${check.extraTurns.join(", ")}.` });

  if (check.combos === "not-needed") rows.push({ ok: true, text: "Two-card combos allowed." });
  else if (check.combos === "clear") rows.push({ ok: true, text: "No two-card combos, checked with Commander Spellbook." });
  else if (check.combos === "removed")
    rows.push({ ok: true, text: `Took out ${check.combosRemoved.join(", ")} to break ${check.combosRemoved.length === 1 ? "a two-card combo" : "two-card combos"}, checked with Commander Spellbook.` });
  else rows.push({ ok: false, text: "Couldn't reach Commander Spellbook to check for two-card combos. Brew again to retry." });

  return (
    <div className="cf-panel-alt rounded-xl p-4 sm:p-5 mb-6">
      <h3 className="cf-display text-base text-parchment mb-3">
        Bracket {bracket.id} rules <span className="text-parchment/45 text-sm">· {bracket.name}</span>
      </h3>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.text} className="flex items-start gap-2 text-xs leading-relaxed">
            {r.ok ? (
              <Check size={14} className="text-green-400/80 shrink-0 mt-px" />
            ) : (
              <AlertTriangle size={14} className="text-amber-300/90 shrink-0 mt-px" />
            )}
            <span className={r.ok ? "text-parchment/70" : "text-amber-200/90"}>{r.text}</span>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-parchment/40 mt-3">
        Based on Wizards' bracket rules. <a href="/faq.html#brackets" className="cf-link">How Brewhall applies them</a>
      </p>
    </div>
  );
}
