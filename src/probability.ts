import { addValue, cardValue, type Card, type Total } from "./cards.ts";

export interface BustOdds {
  busting: number;
  remaining: number;
}

export function hitBustOdds(hand: Total, shoe: Card[]): BustOdds {
  let busting = 0;
  for (const card of shoe) {
    const next = addValue(hand.total, hand.soft, cardValue(card));
    if (next.total > 21) busting++;
  }
  return { busting, remaining: shoe.length };
}

export function countsOf(cards: Card[]): number[] {
  const counts = Array<number>(11).fill(0);
  for (const card of cards) counts[cardValue(card)]++;
  return counts;
}

/**
 * Exact probability the dealer busts.
 * `unseen` includes the hole card and excludes the known upcard.
 */
export function dealerBustProbability(upcard: Card, unseen: Card[], hitSoft17: boolean): number {
  const counts = countsOf(unseen);
  const memo = new Map<string, number>();
  let n = 0;
  for (let value = 1; value <= 10; value++) n += counts[value];
  if (n === 0) return 0;
  let probability = 0;
  const up = cardValue(upcard);
  for (let hole = 1; hole <= 10; hole++) {
    const have = counts[hole];
    if (!have) continue;
    counts[hole] = have - 1;
    const start = addValue(0, false, up);
    const two = addValue(start.total, start.soft, hole);
    probability += (have / n) * bustFrom(two.total, two.soft, counts, hitSoft17, memo);
    counts[hole] = have;
  }
  return probability;
}

function bustFrom(
  total: number,
  soft: boolean,
  counts: number[],
  hitSoft17: boolean,
  memo: Map<string, number>,
): number {
  if (total > 21) return 1;
  const hit = total < 17 || (total === 17 && soft && hitSoft17);
  if (!hit) return 0;
  const key = `${total}${soft ? "s" : "h"}${counts.join(",")}`;
  const cached = memo.get(key);
  if (cached !== undefined) return cached;
  let n = 0;
  for (let value = 1; value <= 10; value++) n += counts[value];
  if (n === 0) {
    memo.set(key, 0);
    return 0;
  }
  let probability = 0;
  for (let value = 1; value <= 10; value++) {
    const have = counts[value];
    if (!have) continue;
    counts[value] = have - 1;
    const next = addValue(total, soft, value);
    probability += (have / n) * bustFrom(next.total, next.soft, counts, hitSoft17, memo);
    counts[value] = have;
  }
  memo.set(key, probability);
  return probability;
}
