// `list` arrives already ordered by Scryfall's EDHREC popularity rank (most
// commonly-played first). A plain uniform shuffle throws that signal away
// completely, which is why well-known staples were showing up on pure luck
// rather than reliably. This keeps some deck-to-deck variety but weights it
// so cards near the top of the popularity order are far more likely to end
// up near the top of the shuffled result too.
export function popularityWeightedShuffle(list) {
  return list
    .map((card, i) => ({ card, score: Math.random() * (i + 1) }))
    .sort((a, b) => a.score - b.score)
    .map((x) => x.card);
}

export function priceOf(name, cardData, priceSource) {
  const d = cardData[name.toLowerCase()];
  if (!d) return null;
  const p = priceSource === "eur" ? d.priceEur : d.priceUsd;
  return p == null ? null : parseFloat(p);
}

export const UNKNOWN_PRICE_ESTIMATE = 2; // used only when a card with no price data must be added under a budget

/* --- Budget shaping ---------------------------------------------------
   No single card may eat an outsized share of the budget. Letting one
   £300 land "fit" inside a £400 budget is technically affordable, but it
   starves the other ~90 slots and forces them all to be bargain-bin
   filler. Two ceilings apply to every pick:

     1. A hard ceiling of MAX_BUDGET_SHARE of the whole budget, so there
        is never a single whale card dominating the deck.
     2. A dynamic ceiling of SPLURGE_FACTOR x the average spend still
        available per unfilled slot. This rises as cheap picks bank
        savings, so the deck can still afford a few genuine chase cards
        later on — just never one that swallows the whole budget.

   Together these produce the spread of expensive / mid / cheap cards a
   real decklist has, instead of one whale plus 90 commons.
---------------------------------------------------------------------- */
export const MAX_BUDGET_SHARE = 0.22;
export const SPLURGE_FACTOR = 9;
// Stop the upgrade pass once we're this close to the budget, so the last
// slice of budget stays unspent and decks keep some deck-to-deck variety
// rather than every build converging on the same "most popular" list.
export const BUDGET_SLACK_TARGET = 0.05;

export function cheapestFirst(list, cardData, priceSource) {
  return [...list].sort(
    (a, b) =>
      (priceOf(a.name, cardData, priceSource) ?? UNKNOWN_PRICE_ESTIMATE) -
      (priceOf(b.name, cardData, priceSource) ?? UNKNOWN_PRICE_ESTIMATE)
  );
}

export function perCardCap(budgetState) {
  if (!budgetState.active) return Infinity;
  const slots = Math.max(1, budgetState.slotsRemaining);
  const dynamic = (budgetState.remaining / slots) * SPLURGE_FACTOR;
  const hard = budgetState.total * MAX_BUDGET_SHARE;
  return Math.min(Math.max(dynamic, 0), hard);
}

export function spend(budgetState, price) {
  budgetState.remaining -= price;
  budgetState.slotsRemaining = Math.max(0, budgetState.slotsRemaining - 1);
}

// Orders candidates priciest-first (no budget, favoring strong staples) or,
// under an active budget, purely by popularity — letting pickWithinBudget
// spend up toward the budget on the best/most popular affordable cards,
// rather than always grabbing the cheapest option in the pool.
export function orderCandidates(list, cardData, priceSource, preferExpensive) {
  const shuffled = popularityWeightedShuffle(list);
  if (priceSource === "none" || !preferExpensive) return shuffled;
  return shuffled.sort((a, b) => {
    const pa = priceOf(a.name, cardData, priceSource);
    const pb = priceOf(b.name, cardData, priceSource);
    const va = pa == null ? -1 : pa;
    const vb = pb == null ? -1 : pb;
    return vb - va;
  });
}

/* Picks `target` cards from an already-ordered list.

   Under a budget, every slot is charged only the DIFFERENCE between the
   card taken and the cheapest card that could have filled that slot. The
   cheapest legal fill is paid for up front (see baselineCost in buildDeck),
   so what's tracked here is purely the upgrade money. That's what keeps a
   tight budget honest: the builder can never spend money it will need for
   the slots it hasn't filled yet, which is what used to force the last few
   picks to overshoot. */
export function pickWithinBudget(ordered, target, cardData, priceSource, budgetState, cheapSorted) {
  if (!budgetState.active) return ordered.slice(0, target);

  const priceFor = (c) => priceOf(c.name, cardData, priceSource) ?? UNKNOWN_PRICE_ESTIMATE;
  const baselineAt = (i) => (cheapSorted && cheapSorted[i] ? priceFor(cheapSorted[i]) : 0);

  const chosen = [];
  const taken = new Set();

  for (const card of ordered) {
    if (chosen.length >= target) break;
    const price = priceFor(card);
    // Skip anything over the per-card ceiling even when it's affordable —
    // there's nearly always a cheaper card doing a similar job, and taking
    // the whale here is exactly what starved every later slot.
    if (price > perCardCap(budgetState)) continue;
    const delta = price - baselineAt(chosen.length);
    if (delta > budgetState.discretionary) continue;
    chosen.push(card);
    taken.add(card);
    budgetState.discretionary -= delta;
    spend(budgetState, price);
  }

  // Any slots still open get the cheapest cards left, which by definition
  // costs no more than the baseline already set aside for them.
  if (chosen.length < target && cheapSorted) {
    for (const card of cheapSorted) {
      if (chosen.length >= target) break;
      if (taken.has(card)) continue;
      const price = priceFor(card);
      budgetState.discretionary -= price - baselineAt(chosen.length);
      chosen.push(card);
      taken.add(card);
      spend(budgetState, price);
    }
  }
  return chosen;
}

// Cards that show up in the vast majority of real Commander decks on EDHREC
// regardless of color identity or archetype — guaranteed a slot (when the
// category has room and they're actually eligible) rather than left to
// compete on equal footing with everything else in the category.
export const AUTO_INCLUDES = {
  ramp: ["Sol Ring", "Arcane Signet"],
  protection: ["Swiftfoot Boots", "Lightning Greaves"],
};

export function pullStaples(candidates, names) {
  const staples = names
    .map((n) => candidates.find((c) => c.name.toLowerCase() === n.toLowerCase()))
    .filter(Boolean);
  const rest = candidates.filter((c) => !staples.includes(c));
  return { staples, rest };
}

/* Capping each card keeps any one of them from swallowing the budget, but
   on its own it tends to leave money unspent. This pass puts that leftover
   to work: it repeatedly finds the least-played card currently in the deck
   and trades it for the most expensive unused card that is BOTH better
   played and still under the per-card ceiling. The result spends up toward
   the budget on genuinely stronger cards, rather than panic-filling with
   whatever was cheapest. It deliberately stops a little short of the full
   budget so decks don't all converge on an identical "top cards" list. */
export function upgradeWithinBudget(picks, categoryCards, usedNames, cardData, priceSource, budgetState) {
  if (!budgetState.active) return;

  const ranks = {};
  Object.entries(categoryCards).forEach(([cat, list]) => {
    ranks[cat] = new Map(list.map((c, i) => [c.name.toLowerCase(), i]));
  });

  const floor = budgetState.total * BUDGET_SLACK_TARGET;
  let guard = 0;
  let improved = true;

  while (improved && guard++ < 400 && budgetState.discretionary > floor) {
    improved = false;

    for (const cat of Object.keys(picks)) {
      if (budgetState.discretionary <= floor) break;
      const list = categoryCards[cat] || [];
      const rank = ranks[cat];
      const chosen = picks[cat];
      if (!list.length || !chosen || !chosen.length) continue;

      // The weakest card we currently hold in this category.
      let worstIdx = -1;
      let worstRank = -1;
      chosen.forEach((c, i) => {
        const r = rank.get(c.name.toLowerCase()) ?? Infinity;
        if (r > worstRank) {
          worstRank = r;
          worstIdx = i;
        }
      });
      if (worstIdx < 0) continue;

      const worst = chosen[worstIdx];
      // Never trade away a guaranteed staple like Sol Ring.
      if ((AUTO_INCLUDES[cat] || []).some((n) => n.toLowerCase() === worst.name.toLowerCase())) continue;
      const worstPrice = priceOf(worst.name, cardData, priceSource) ?? UNKNOWN_PRICE_ESTIMATE;

      // Best swap = most expensive unused card that is still more played
      // than what we'd drop, affordable, and under the per-card ceiling.
      const cap = perCardCap(budgetState);
      let best = null;
      let bestPrice = worstPrice;
      for (const cand of list) {
        const key = cand.name.toLowerCase();
        if (usedNames.has(key)) continue;
        if ((rank.get(key) ?? Infinity) >= worstRank) continue;
        const p = priceOf(cand.name, cardData, priceSource) ?? UNKNOWN_PRICE_ESTIMATE;
        if (p > cap) continue;
        if (p <= bestPrice) continue;
        if (p - worstPrice > budgetState.discretionary) continue;
        best = cand;
        bestPrice = p;
      }
      if (!best) continue;

      chosen[worstIdx] = best;
      usedNames.delete(worst.name.toLowerCase());
      usedNames.add(best.name.toLowerCase());
      budgetState.discretionary -= bestPrice - worstPrice;
      budgetState.remaining -= bestPrice - worstPrice;
      improved = true;
    }
  }
}

/* The last word on the budget. Prices can still move after picking (a card
   budgeted at a guess turns out dearer, or a combo or bracket swap brings
   in a different card), which left some decks a few pence over. While the
   deck is over `limit`, this swaps a card for the cheapest priced card left
   in its role that `allowed` accepts, choosing the smallest swap that gets
   under (or the biggest saving if none does alone). `picks` maps roles to
   cards; `poolFor(role)` lists a role's candidates. Guaranteed staples like
   Sol Ring stay, as do cards named in `keep`. Returns the new picks. */
export function trimToBudget({ picks, poolFor, limit, cardData, priceSource, allowed = () => true, keep = new Set() }) {
  const priceFor = (c) => priceOf(c.name, cardData, priceSource) ?? 0;
  const next = Object.fromEntries(Object.entries(picks).map(([role, cards]) => [role, [...cards]]));
  const inDeck = new Set(Object.values(next).flat().map((c) => c.name.toLowerCase()));
  const staples = new Set(Object.values(AUTO_INCLUDES).flat().map((n) => n.toLowerCase()));
  let total = Object.values(next).flat().reduce((s, c) => s + priceFor(c), 0);

  for (let guard = 0; total > limit + 1e-9 && guard < 120; guard++) {
    const options = [];
    Object.entries(next).forEach(([role, cards]) => {
      const cheapest = cheapestFirst(poolFor(role), cardData, priceSource)
        .find((c) => !inDeck.has(c.name.toLowerCase()) && priceOf(c.name, cardData, priceSource) != null && allowed(c));
      if (!cheapest) return;
      cards.forEach((card, i) => {
        if (staples.has(card.name.toLowerCase()) || keep.has(card.name.toLowerCase())) return;
        const saving = priceFor(card) - priceFor(cheapest);
        if (saving > 0) options.push({ saving, role, i, card, swapIn: cheapest });
      });
    });
    if (!options.length) break;
    // The smallest swap that gets the deck under, so a few pence over
    // doesn't cost its best card; failing that, the biggest saving.
    const over = total - limit;
    const enough = options.filter((o) => o.saving >= over);
    const best = enough.length
      ? enough.reduce((a, b) => (b.saving < a.saving ? b : a))
      : options.reduce((a, b) => (b.saving > a.saving ? b : a));
    next[best.role][best.i] = best.swapIn;
    inDeck.delete(best.card.name.toLowerCase());
    inDeck.add(best.swapIn.name.toLowerCase());
    total -= best.saving;
  }
  return next;
}

export function formatPrice(value, source) {
  if (value == null) return "—";
  const n = parseFloat(value);
  if (Number.isNaN(n)) return "—";
  return source === "eur" ? `€${n.toFixed(2)}` : `$${n.toFixed(2)}`;
}
