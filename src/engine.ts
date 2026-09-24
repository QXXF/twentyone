import {
  cardLabel,
  cardValue,
  handTotal,
  hiLo,
  isNatural,
  isTen,
  pairValue,
  type Card,
} from "./cards.ts";
import { dealerBustProbability, hitBustOdds } from "./probability.ts";
import { createShoe, draw, loadShoe, needsShuffle, reshuffle, type Shoe } from "./shoe.ts";
import { advise, insuranceAdvice, type Advice, type PlayerAction } from "./strategy.ts";

export interface TableConfig {
  decks: number;
  hitSoft17: boolean;
  lateSurrender: boolean;
  /** Starting bankroll in cents. */
  bankrollCents: number;
}

export type Phase = "bet" | "insurance" | "player" | "done";

export interface PlayerHand {
  cards: Card[];
  betCents: number;
  /** Betting box, 0–2. One person can play several boxes in the same round. */
  seat: number;
  fromSplit: boolean;
  aceSplit: boolean;
  status: "open" | "stand" | "bust" | "surrender" | "blackjack";
}

export interface HandOutcome {
  title: string;
  detail: string;
  netCents: number;
}

export interface Table {
  decks: number;
  hitSoft17: boolean;
  lateSurrender: boolean;
  bankrollCents: number;
  startBankrollCents: number;
  shoe: Shoe;
  rng: () => number;
  phase: Phase;
  betCents: number;
  hands: PlayerHand[];
  active: number;
  dealer: Card[];
  holeRevealed: boolean;
  insuranceCents: number;
  insuranceOffered: boolean;
  log: string[];
  outcomes: HandOutcome[];
  roundNetCents: number;
  rounds: number;
  runningCount: number;
  seenCards: number;
  reshuffled: boolean;
}

export function createTable(config: TableConfig, rng: () => number = Math.random): Table {
  return {
    decks: config.decks,
    hitSoft17: config.hitSoft17,
    lateSurrender: config.lateSurrender,
    bankrollCents: config.bankrollCents,
    startBankrollCents: config.bankrollCents,
    shoe: createShoe(config.decks, rng),
    rng,
    phase: "bet",
    betCents: 0,
    hands: [],
    active: 0,
    dealer: [],
    holeRevealed: false,
    insuranceCents: 0,
    insuranceOffered: false,
    log: [],
    outcomes: [],
    roundNetCents: 0,
    rounds: 0,
    runningCount: 0,
    seenCards: 0,
    reshuffled: false,
  };
}

export function resetSession(table: Table, config: TableConfig): void {
  table.decks = config.decks;
  table.hitSoft17 = config.hitSoft17;
  table.lateSurrender = config.lateSurrender;
  table.bankrollCents = config.bankrollCents;
  table.startBankrollCents = config.bankrollCents;
  table.shoe = createShoe(config.decks, table.rng);
  table.phase = "bet";
  table.hands = [];
  table.dealer = [];
  table.log = [];
  table.outcomes = [];
  table.rounds = 0;
  table.runningCount = 0;
  table.seenCards = 0;
  table.reshuffled = false;
}

export function syncRules(table: Table, config: Pick<TableConfig, "decks" | "hitSoft17" | "lateSurrender">): void {
  const deckChange = config.decks !== table.decks;
  table.hitSoft17 = config.hitSoft17;
  table.lateSurrender = config.lateSurrender;
  if (deckChange) {
    table.decks = config.decks;
    table.shoe = createShoe(config.decks, table.rng);
    table.runningCount = 0;
    table.seenCards = 0;
  }
}

/** Test hook. `cards[0]` is dealt first. */
export function scriptShoe(table: Table, cards: Card[]): void {
  loadShoe(table.shoe, cards);
}

/** One stake, or up to three boxes. A `0` leaves that seat empty. */
export function deal(table: Table, betCents: number | readonly number[]): void {
  if (table.phase !== "bet" && table.phase !== "done") return;
  const raw = typeof betCents === "number" ? [betCents] : [...betCents];
  if (raw.length === 0 || raw.length > 3) return;
  const seated = raw
    .map((bet, seat) => ({ bet, seat }))
    .filter((item) => item.bet > 0);
  if (seated.length === 0) return;
  if (seated.some((item) => !Number.isInteger(item.bet))) return;
  const total = seated.reduce((sum, item) => sum + item.bet, 0);
  if (total > table.bankrollCents) return;
  if (needsShuffle(table.shoe)) {
    reshuffle(table.shoe, table.rng);
    table.runningCount = 0;
    table.seenCards = 0;
    table.reshuffled = true;
  } else {
    table.reshuffled = false;
  }
  table.betCents = total;
  table.bankrollCents -= total;
  table.rounds += 1;
  table.hands = seated.map((item) => ({
    cards: [],
    betCents: item.bet,
    seat: item.seat,
    fromSplit: false,
    aceSplit: false,
    status: "open" as const,
  }));
  table.active = 0;
  table.dealer = [];
  table.holeRevealed = false;
  table.insuranceCents = 0;
  table.insuranceOffered = false;
  table.log = [];
  table.outcomes = [];
  table.roundNetCents = 0;
  if (table.reshuffled) {
    table.log.push("Il taglio è stato raggiunto. Lo shoe viene rimescolato.");
  }

  for (const hand of table.hands) hand.cards.push(take(table, true));
  table.dealer.push(take(table, true));
  for (const hand of table.hands) hand.cards.push(take(table, true));
  table.dealer.push(take(table, false));

  const up = table.dealer[0];
  if (table.hands.length === 1) {
    const hand = table.hands[0];
    table.log.push(
      `Le tue carte: ${showCards(hand.cards)} (${formatTotal(hand.cards)}). Il banco mostra ${cardLabel(up)}.`,
    );
  } else {
    for (const hand of table.hands) {
      table.log.push(`Posto ${hand.seat + 1}: ${showCards(hand.cards)} (${formatTotal(hand.cards)}).`);
    }
    table.log.push(`Il banco mostra ${cardLabel(up)}.`);
  }
  if (up.rank === "A") {
    table.insuranceOffered = true;
    table.phase = "insurance";
    table.log.push("Il banco mostra un asso: puoi assicurarti per metà puntata, prima che controlli il blackjack.");
    return;
  }
  if (isTen(up)) {
    table.log.push("Il banco mostra un 10 e controlla la carta coperta.");
    resolvePeek(table);
    return;
  }
  awardNaturals(table);
  beginPlay(table);
}

export function insuranceStake(table: Table): number {
  let cost = 0;
  for (const hand of table.hands) cost += Math.floor(hand.betCents / 2);
  return cost;
}

export function takeInsurance(table: Table, takeIt: boolean): void {
  if (table.phase !== "insurance") return;
  if (takeIt) {
    const cost = insuranceStake(table);
    if (cost <= 0 || cost > table.bankrollCents) {
      table.log.push("Fiche insufficienti per l'assicurazione. La mano prosegue senza.");
    } else {
      table.insuranceCents = cost;
      table.bankrollCents -= cost;
      table.log.push(
        `Assicurazione presa per ${chips(cost)} fiche. La basic strategy la rifiuta. La mano prosegue con la tua scelta.`,
      );
    }
  } else {
    table.log.push("Assicurazione rifiutata.");
  }
  resolvePeek(table);
}

export function act(table: Table, action: PlayerAction): void {
  if (table.phase !== "player") return;
  const hand = table.hands[table.active];
  if (!hand || hand.status !== "open") return;
  const legal = legalActions(table);
  if (!legal.includes(action)) return;
  const advice = currentAdvice(table);

  if (action === "hit") {
    hand.cards.push(take(table, true));
    table.log.push(`Peschi ${cardLabel(hand.cards[hand.cards.length - 1])}. Totale ${formatTotal(hand.cards)}.`);
    settleDraw(hand);
    noteDeviation(table, action, advice);
    if (hand.status !== "open") advance(table);
    return;
  }
  if (action === "stand") {
    hand.status = "stand";
    table.log.push(`Stai su ${formatTotal(hand.cards)}.`);
    noteDeviation(table, action, advice);
    advance(table);
    return;
  }
  if (action === "double") {
    table.bankrollCents -= hand.betCents;
    hand.betCents += hand.betCents;
    hand.cards.push(take(table, true));
    hand.status = handTotal(hand.cards).total > 21 ? "bust" : "stand";
    table.log.push(
      `Raddoppi: una sola carta, ${cardLabel(hand.cards[hand.cards.length - 1])}. Totale ${formatTotal(hand.cards)}. Puntata ${chips(hand.betCents)}.`,
    );
    noteDeviation(table, action, advice);
    advance(table);
    return;
  }
  if (action === "surrender") {
    hand.status = "surrender";
    table.log.push("Resa: perdi metà puntata e la mano finisce.");
    noteDeviation(table, action, advice);
    advance(table);
    return;
  }
  splitHand(table, hand, advice);
}

export function legalActions(table: Table): PlayerAction[] {
  if (table.phase !== "player") return [];
  const hand = table.hands[table.active];
  if (!hand || hand.status !== "open") return [];
  const actions: PlayerAction[] = ["hit", "stand"];
  if (canDouble(table, hand) && table.bankrollCents >= hand.betCents) actions.push("double");
  if (canSplit(table, hand) && table.bankrollCents >= hand.betCents) actions.push("split");
  if (canSurrender(table, hand)) actions.push("surrender");
  return actions;
}

export function currentAdvice(table: Table): Advice | null {
  if (table.phase === "insurance") {
    const unseen = unseenCards(table);
    let tens = 0;
    for (const card of unseen) if (cardValue(card) === 10) tens++;
    return insuranceAdvice(tens, unseen.length);
  }
  if (table.phase !== "player") return null;
  const hand = table.hands[table.active];
  if (!hand || hand.status !== "open") return null;
  return advise({
    cards: hand.cards,
    hitSoft17: table.hitSoft17,
    rulesDouble: canDouble(table, hand),
    rulesSplit: canSplit(table, hand),
    rulesSurrender: canSurrender(table, hand),
    affordDouble: table.bankrollCents >= hand.betCents,
    affordSplit: table.bankrollCents >= hand.betCents,
    upcard: table.dealer[0],
  });
}

export function unseenCards(table: Table): Card[] {
  const cards = table.shoe.cards.slice();
  if (!table.holeRevealed && table.dealer[1]) cards.push(table.dealer[1]);
  return cards;
}

export function hitOdds(table: Table): { busting: number; remaining: number } | null {
  if (table.phase !== "player" && table.phase !== "insurance") return null;
  const hand = table.hands[table.active];
  if (!hand || hand.status !== "open") return null;
  return hitBustOdds(handTotal(hand.cards), table.shoe.cards);
}

export function dealerBust(table: Table): number | null {
  if (table.phase !== "player" && table.phase !== "insurance") return null;
  if (!table.dealer[0]) return null;
  return dealerBustProbability(table.dealer[0], unseenCards(table), table.hitSoft17);
}

export function trueCount(table: Table): number {
  const unseen = table.shoe.cards.length + (table.holeRevealed || !table.dealer[1] ? 0 : 1);
  const decks = Math.max(unseen / 52, 0.25);
  return table.runningCount / decks;
}

function splitHand(table: Table, hand: PlayerHand, advice: Advice | null): void {
  const aces = pairValue(hand.cards) === 1;
  const [first, second] = hand.cards;
  const left = childHand(table, hand, first, aces);
  const right = childHand(table, hand, second, aces);
  table.bankrollCents -= hand.betCents;
  table.hands.splice(table.active, 1, left, right);
  table.log.push(
    aces
      ? `Dividi gli assi. ${showCards(left.cards)} e ${showCards(right.cards)}. Una carta ciascuna: niente blackjack, niente altre carte.`
      : `Dividi. Prima mano ${showCards(left.cards)} (${formatTotal(left.cards)}), seconda ${showCards(right.cards)} (${formatTotal(right.cards)}).`,
  );
  noteDeviation(table, "split", advice);
  if (aces) {
    left.status = "stand";
    right.status = "stand";
    advance(table);
    return;
  }
  if (handTotal(left.cards).total === 21) left.status = "stand";
  if (left.status !== "open") advance(table);
}

function childHand(table: Table, hand: PlayerHand, kept: Card, aces: boolean): PlayerHand {
  const cards = [kept, take(table, true)];
  const total = handTotal(cards).total;
  return {
    cards,
    betCents: hand.betCents,
    seat: hand.seat,
    fromSplit: true,
    aceSplit: aces,
    status: !aces && total === 21 ? "stand" : "open",
  };
}

function resolvePeek(table: Table): void {
  const dealerBj = isNatural(table.dealer);
  if (dealerBj) {
    revealHole(table);
    table.log.push(`Il banco ha blackjack: ${showCards(table.dealer)}.`);
    payInsurance(table, true);
    for (const hand of table.hands) {
      hand.status = "stand";
      const title = handTitle(table, hand);
      if (isNatural(hand.cards) && !hand.fromSplit) {
        pushHand(table, hand, "Blackjack contro blackjack: pareggio, puntata restituita.", title);
      } else {
        loseHand(table, hand, "Il banco ha blackjack. Perdi la puntata.", title);
      }
    }
    finishRound(table);
    return;
  }
  table.log.push("Il banco non ha blackjack.");
  payInsurance(table, false);
  awardNaturals(table);
  beginPlay(table);
}

function awardNaturals(table: Table): void {
  let any = false;
  for (const hand of table.hands) {
    if (hand.status !== "open" || hand.fromSplit || !isNatural(hand.cards)) continue;
    any = true;
    const profit = Math.round((hand.betCents * 3) / 2);
    hand.status = "blackjack";
    table.bankrollCents += hand.betCents + profit;
    table.outcomes.push({
      title: handTitle(table, hand),
      detail: `Blackjack naturale, paga 3:2. Vinci ${chips(profit)} oltre la puntata.`,
      netCents: profit,
    });
  }
  if (any && table.hands.some((hand) => hand.status === "open")) {
    table.log.push("I blackjack naturali sono pagati 3:2. Le altre mani si giocano.");
  }
}

function beginPlay(table: Table): void {
  const open = table.hands.findIndex((hand) => hand.status === "open");
  if (open === -1) {
    revealHole(table);
    const natural = table.hands.some((hand) => hand.status === "blackjack");
    table.log.push(
      natural
        ? `Blackjack naturale. Il banco ha ${showCards(table.dealer)} (${formatTotal(table.dealer)}).`
        : `Il banco ha ${showCards(table.dealer)} (${formatTotal(table.dealer)}).`,
    );
    finishRound(table);
    return;
  }
  table.active = open;
  table.phase = "player";
}

function payInsurance(table: Table, dealerBlackjack: boolean): void {
  if (!table.insuranceOffered) return;
  if (table.insuranceCents === 0) return;
  if (dealerBlackjack) {
    const returned = table.insuranceCents * 3;
    table.bankrollCents += returned;
    table.outcomes.push({
      title: "Assicurazione",
      detail: `Il banco ha blackjack. L'assicurazione paga 2:1: +${chips(table.insuranceCents * 2)}.`,
      netCents: table.insuranceCents * 2,
    });
  } else {
    table.outcomes.push({
      title: "Assicurazione",
      detail: "Il banco non ha blackjack. L'assicurazione è persa.",
      netCents: -table.insuranceCents,
    });
  }
}

function advance(table: Table): void {
  while (table.active < table.hands.length && table.hands[table.active].status !== "open") {
    table.active += 1;
  }
  if (table.active >= table.hands.length) playDealer(table);
}

function playDealer(table: Table): void {
  revealHole(table);
  const alive = table.hands.some((hand) => hand.status === "stand");
  if (alive) {
    let guard = 0;
    while (dealerHits(table) && guard < 20) {
      const card = take(table, true);
      table.dealer.push(card);
      table.log.push(`Il banco pesca ${cardLabel(card)}. Totale ${formatTotal(table.dealer)}.`);
      guard += 1;
    }
  } else {
    table.log.push("Nessuna mano ancora in gioco: il banco non pesca oltre la carta coperta.");
  }
  const dealer = handTotal(table.dealer);
  table.log.push(
    dealer.total > 21
      ? `Il banco sballa con ${showCards(table.dealer)}.`
      : `Il banco sta con ${showCards(table.dealer)} (${formatTotal(table.dealer)}).`,
  );
  for (const hand of table.hands) settleHand(table, hand);
  finishRound(table);
}

function dealerHits(table: Table): boolean {
  const total = handTotal(table.dealer);
  if (total.total > 21) return false;
  if (total.total < 17) return true;
  return total.total === 17 && total.soft && table.hitSoft17;
}

function settleHand(table: Table, hand: PlayerHand): void {
  if (hand.status === "blackjack") return;
  const title = handTitle(table, hand);
  const dealer = handTotal(table.dealer);
  const player = handTotal(hand.cards);
  if (hand.status === "surrender") {
    const back = Math.floor(hand.betCents / 2);
    table.bankrollCents += back;
    table.outcomes.push({
      title,
      detail: `Resa. Perdi metà puntata (${chips(hand.betCents - back)}).`,
      netCents: back - hand.betCents,
    });
    return;
  }
  if (hand.status === "bust" || player.total > 21) {
    table.outcomes.push({
      title,
      detail: `Sballo a ${player.total}. La puntata è persa, anche se il banco sballa dopo.`,
      netCents: -hand.betCents,
    });
    return;
  }
  if (dealer.total > 21 || player.total > dealer.total) {
    table.bankrollCents += hand.betCents * 2;
    table.outcomes.push({
      title,
      detail:
        dealer.total > 21
          ? `Il banco sballa. Vinci 1:1, +${chips(hand.betCents)}.`
          : `${player.total} batte ${dealer.total}. Vinci 1:1, +${chips(hand.betCents)}.`,
      netCents: hand.betCents,
    });
    return;
  }
  if (player.total === dealer.total) {
    pushHand(table, hand, `Pareggio a ${player.total}. Puntata restituita.`, title);
    return;
  }
  loseHand(table, hand, `${player.total} perde contro ${dealer.total}.`, title);
}

export function handTitle(table: Table, hand: PlayerHand): string {
  const seats = new Set(table.hands.map((item) => item.seat));
  const mates = table.hands.filter((item) => item.seat === hand.seat);
  const nth = mates.indexOf(hand) + 1;
  if (seats.size === 1 && mates.length === 1) return "La tua mano";
  if (seats.size === 1) return `Mano ${nth}`;
  if (mates.length === 1) return `Posto ${hand.seat + 1}`;
  return `Posto ${hand.seat + 1}, mano ${nth}`;
}

function pushHand(table: Table, hand: PlayerHand, detail: string, title = "La tua mano"): void {
  table.bankrollCents += hand.betCents;
  table.outcomes.push({ title, detail, netCents: 0 });
}

function loseHand(table: Table, hand: PlayerHand, detail: string, title = "La tua mano"): void {
  table.outcomes.push({ title, detail, netCents: -hand.betCents });
}

function finishRound(table: Table): void {
  table.phase = "done";
  table.roundNetCents = table.outcomes.reduce((sum, outcome) => sum + outcome.netCents, 0);
  const sign = table.roundNetCents > 0 ? "+" : "";
  table.log.push(`Bankroll: ${chips(table.bankrollCents)} fiche (${sign}${chips(table.roundNetCents)} in questa mano).`);
}

function revealHole(table: Table): void {
  if (table.holeRevealed) return;
  table.holeRevealed = true;
  if (table.dealer[1]) see(table, table.dealer[1]);
}

function take(table: Table, visible: boolean): Card {
  if (table.shoe.cards.length === 0 && !table.shoe.scripted) {
    table.runningCount = 0;
    table.seenCards = 0;
    table.log.push("Shoe esaurito a metà mano: rimescolato.");
  }
  const card = draw(table.shoe, table.rng);
  if (visible) see(table, card);
  return card;
}

function see(table: Table, card: Card): void {
  table.runningCount += hiLo(card);
  table.seenCards += 1;
}

function settleDraw(hand: PlayerHand): void {
  const total = handTotal(hand.cards).total;
  if (total > 21) hand.status = "bust";
  else if (total === 21) hand.status = "stand";
}

function canDouble(table: Table, hand: PlayerHand): boolean {
  return hand.cards.length === 2 && !hand.aceSplit && hand.status === "open" && table.phase === "player";
}

function canSplit(table: Table, hand: PlayerHand): boolean {
  return (
    hand.status === "open" &&
    !hand.aceSplit &&
    pairValue(hand.cards) !== null &&
    table.hands.filter((item) => item.seat === hand.seat).length < 4
  );
}

function canSurrender(table: Table, hand: PlayerHand): boolean {
  return table.lateSurrender && !hand.fromSplit && hand.cards.length === 2 && hand.status === "open";
}

function noteDeviation(table: Table, action: PlayerAction, advice: Advice | null): void {
  if (!advice || action === advice.action) return;
  table.log.push(
    `Hai scelto ${labelOf(action)}. La basic strategy indica «${advice.label}». La mano prosegue con la tua scelta.`,
  );
}

function labelOf(action: PlayerAction): string {
  if (action === "hit") return "Pesca";
  if (action === "stand") return "Stai";
  if (action === "double") return "Raddoppia";
  if (action === "split") return "Dividi";
  return "Resa";
}

function showCards(cards: Card[]): string {
  return cards.map(cardLabel).join(", ");
}

function formatTotal(cards: Card[]): string {
  const total = handTotal(cards);
  return total.soft ? `soft ${total.total}` : String(total.total);
}

export function chips(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.trunc(abs / 100);
  const frac = abs % 100;
  const body = frac === 0 ? String(whole) : `${whole},${String(frac).padStart(2, "0")}`;
  return (negative ? "-" : "") + body;
}
