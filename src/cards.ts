export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
export const SUITS = ["S", "H", "D", "C"] as const;

export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];

export interface Card {
  rank: Rank;
  suit: Suit;
}

export function cardValue(card: Card): number {
  if (card.rank === "A") return 1;
  if (card.rank === "J" || card.rank === "Q" || card.rank === "K") return 10;
  return Number(card.rank);
}

export function isTen(card: Card): boolean {
  return cardValue(card) === 10;
}

export interface Total {
  total: number;
  soft: boolean;
}

export function handTotal(cards: Card[]): Total {
  let state: Total = { total: 0, soft: false };
  for (const card of cards) state = addValue(state.total, state.soft, cardValue(card));
  return state;
}

/** Ace counts as 11 while `soft` is true. A new ace becomes 11 when it fits. */
export function addValue(total: number, soft: boolean, value: number): Total {
  if (value === 1) {
    if (total + 11 <= 21) return { total: total + 11, soft: true };
    return { total: total + 1, soft };
  }
  let next = total + value;
  if (next > 21 && soft) return { total: next - 10, soft: false };
  return { total: next, soft };
}

export function isNatural(cards: Card[]): boolean {
  return cards.length === 2 && handTotal(cards).total === 21;
}

export function pairValue(cards: Card[]): number | null {
  if (cards.length !== 2) return null;
  const a = cardValue(cards[0]);
  const b = cardValue(cards[1]);
  return a === b ? a : null;
}

const SUIT_NAME: Record<Suit, string> = {
  S: "picche",
  H: "cuori",
  D: "quadri",
  C: "fiori",
};

const RANK_NAME: Record<Rank, string> = {
  A: "asso",
  J: "fante",
  Q: "donna",
  K: "re",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6",
  "7": "7",
  "8": "8",
  "9": "9",
  "10": "10",
};

export function cardLabel(card: Card): string {
  return `${RANK_NAME[card.rank]} di ${SUIT_NAME[card.suit]}`;
}

export function suitGlyph(suit: Suit): string {
  if (suit === "H") return "♥";
  if (suit === "D") return "♦";
  if (suit === "C") return "♣";
  return "♠";
}

export function isRed(suit: Suit): boolean {
  return suit === "H" || suit === "D";
}

export function freshShoe(decks: number): Card[] {
  const cards: Card[] = [];
  for (let d = 0; d < decks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) cards.push({ rank, suit });
    }
  }
  return cards;
}

export function shuffle(cards: Card[], rng: () => number): void {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = cards[i];
    cards[i] = cards[j];
    cards[j] = tmp;
  }
}

export function hiLo(card: Card): number {
  const value = cardValue(card);
  if (value >= 2 && value <= 6) return 1;
  if (value === 1 || value === 10) return -1;
  return 0;
}

export function upName(card: Card): string {
  if (card.rank === "A") return "asso";
  if (card.rank === "J" || card.rank === "Q" || card.rank === "K") return "10";
  return card.rank;
}
