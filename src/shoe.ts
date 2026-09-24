import { freshShoe, shuffle, type Card } from "./cards.ts";

export interface Shoe {
  cards: Card[];
  /** Reshuffle before the next hand when this many cards or fewer remain. */
  cutRemaining: number;
  decks: number;
  scripted: boolean;
  penetration: number;
}

export function createShoe(decks: number, rng: () => number): Shoe {
  const shoe: Shoe = {
    cards: [],
    cutRemaining: 0,
    decks,
    scripted: false,
    penetration: 0.75,
  };
  reshuffle(shoe, rng);
  return shoe;
}

export function reshuffle(shoe: Shoe, rng: () => number): void {
  shoe.cards = freshShoe(shoe.decks);
  shuffle(shoe.cards, rng);
  shoe.penetration = 0.75 + rng() * 0.05;
  shoe.cutRemaining = Math.floor(shoe.cards.length * (1 - shoe.penetration));
  shoe.scripted = false;
}

/** `cards[0]` is the next card dealt. */
export function loadShoe(shoe: Shoe, cards: Card[]): void {
  shoe.cards = cards.slice().reverse();
  shoe.cutRemaining = -1;
  shoe.scripted = true;
}

export function draw(shoe: Shoe, rng: () => number): Card {
  if (shoe.cards.length === 0) {
    if (shoe.scripted) throw new Error("Mazzo di prova esaurito");
    // ponytail: a mid-hand reshuffle builds a full new shoe, so cards already in play can reappear. The cut card makes this rare; a discard tray would fix it.
    reshuffle(shoe, rng);
  }
  const card = shoe.cards.pop();
  if (!card) throw new Error("Shoe vuoto");
  return card;
}

export function needsShuffle(shoe: Shoe): boolean {
  return !shoe.scripted && shoe.cards.length <= shoe.cutRemaining;
}
