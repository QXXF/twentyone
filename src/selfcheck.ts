import assert from "node:assert/strict";
import { freshShoe, handTotal, pairValue, type Card, type Rank } from "./cards.ts";
import {
  act,
  chips,
  createTable,
  currentAdvice,
  deal,
  legalActions,
  scriptShoe,
  takeInsurance,
  type Table,
} from "./engine.ts";
import { dealerBustProbability, hitBustOdds } from "./probability.ts";
import { createShoe, draw, needsShuffle } from "./shoe.ts";
import { advise } from "./strategy.ts";

function card(rank: Rank, suit: Card["suit"] = "S"): Card {
  return { rank, suit };
}

function table(): Table {
  return createTable(
    { decks: 6, hitSoft17: false, lateSurrender: true, bankrollCents: 100_000 },
    () => 0.5,
  );
}

function play(cards: Card[], bet = 1000): Table {
  const game = table();
  scriptShoe(game, cards);
  deal(game, bet);
  return game;
}

const bj = play([card("A"), card("9"), card("K"), card("5", "H")]);
assert.equal(bj.phase, "done");
assert.equal(bj.bankrollCents, 101_500);
assert.ok(bj.outcomes.some((outcome) => outcome.detail.includes("3:2")));

const push = play([card("A"), card("A", "H"), card("K"), card("K", "H")]);
assert.equal(push.phase, "insurance");
takeInsurance(push, false);
assert.equal(push.phase, "done");
assert.equal(push.bankrollCents, 100_000);
assert.ok(push.outcomes.some((outcome) => outcome.netCents === 0));

const insured = play([card("10"), card("A"), card("8"), card("K", "H")]);
takeInsurance(insured, true);
assert.equal(insured.bankrollCents, 100_000);
assert.ok(insured.log.some((line) => line.includes("basic strategy la rifiuta")));

const soft = play([card("10"), card("6"), card("9"), card("A", "H")]);
assert.equal(soft.phase, "player");
act(soft, "stand");
assert.equal(soft.dealer.length, 2);
assert.equal(handTotal(soft.dealer).total, 17);
assert.equal(handTotal(soft.dealer).soft, true);
assert.equal(soft.bankrollCents, 101_000);

const hitsSoft = table();
hitsSoft.hitSoft17 = true;
scriptShoe(hitsSoft, [card("10"), card("6"), card("9"), card("A", "H"), card("K", "D")]);
deal(hitsSoft, 1000);
act(hitsSoft, "stand");
assert.equal(hitsSoft.dealer.length, 3);

const hits16 = play([card("K"), card("10"), card("Q"), card("6"), card("5", "H")]);
act(hits16, "stand");
assert.equal(hits16.dealer.length, 3);
assert.equal(handTotal(hits16.dealer).total, 21);

const bust = play([card("10"), card("10", "H"), card("6"), card("6", "H"), card("K"), card("5")]);
act(bust, "hit");
assert.equal(bust.hands[0].status, "bust");
assert.equal(bust.dealer.length, 2);
assert.equal(bust.bankrollCents, 99_000);

const surrendered = play([card("10"), card("10", "H"), card("6"), card("9")]);
assert.equal(surrendered.phase, "player");
act(surrendered, "surrender");
assert.equal(surrendered.bankrollCents, 99_500);
assert.equal(surrendered.dealer.length, 2);

const aces = play([
  card("A"),
  card("9"),
  card("A", "H"),
  card("7"),
  card("K"),
  card("9", "H"),
  card("K", "D"),
]);
act(aces, "split");
assert.equal(aces.hands.length, 2);
assert.equal(aces.hands.every((hand) => hand.cards.length === 2), true);
assert.equal(aces.outcomes.every((outcome) => !outcome.detail.includes("3:2")), true);
assert.equal(aces.bankrollCents, 102_000);

const doubled = play([card("5"), card("6"), card("6", "H"), card("10"), card("10", "H"), card("K")]);
act(doubled, "double");
assert.equal(doubled.hands[0].cards.length, 3);
assert.equal(doubled.bankrollCents, 102_000);

const splits = play([
  card("8"),
  card("6"),
  card("8", "H"),
  card("5"),
  card("8", "D"),
  card("8", "C"),
  card("8", "S"),
  card("8", "H"),
  card("8", "D"),
  card("8", "C"),
]);
let splitsDone = 0;
while (legalActions(splits).includes("split") && splitsDone < 5) {
  act(splits, "split");
  splitsDone += 1;
}
assert.equal(splits.hands.length, 4);
assert.equal(splitsDone, 3);
assert.equal(pairValue(splits.hands[splits.active].cards), 8);
assert.equal(legalActions(splits).includes("split"), false);

const stiff = play([card("10"), card("K"), card("6"), card("9")]);
const advice = currentAdvice(stiff);
assert.equal(advice?.action, "surrender");
stiff.lateSurrender = false;
assert.equal(currentAdvice(stiff)?.action, "hit");
assert.equal(legalActions(stiff).includes("surrender"), false);

const tens = play([card("K"), card("6"), card("10"), card("9")]);
assert.equal(legalActions(tens).includes("split"), true);
assert.equal(currentAdvice(tens)?.action, "stand");

assert.equal(
  advise({
    cards: [card("8"), card("8", "H")],
    upcard: card("10"),
    hitSoft17: false,
    rulesDouble: true,
    rulesSplit: true,
    rulesSurrender: true,
    affordDouble: true,
    affordSplit: true,
  }).action,
  "split",
);
assert.equal(
  advise({
    cards: [card("6"), card("5")],
    upcard: card("A"),
    hitSoft17: false,
    rulesDouble: true,
    rulesSplit: false,
    rulesSurrender: true,
    affordDouble: true,
    affordSplit: false,
  }).action,
  "hit",
);
assert.equal(
  advise({
    cards: [card("6"), card("5")],
    upcard: card("A"),
    hitSoft17: true,
    rulesDouble: true,
    rulesSplit: false,
    rulesSurrender: true,
    affordDouble: true,
    affordSplit: false,
  }).action,
  "double",
);
assert.equal(
  advise({
    cards: [card("10"), card("6")],
    upcard: card("9"),
    hitSoft17: false,
    rulesDouble: true,
    rulesSplit: false,
    rulesSurrender: true,
    affordDouble: true,
    affordSplit: false,
  }).action,
  "surrender",
);
assert.equal(
  advise({
    cards: [card("8"), card("8", "H")],
    upcard: card("A"),
    hitSoft17: true,
    rulesDouble: true,
    rulesSplit: true,
    rulesSurrender: true,
    affordDouble: true,
    affordSplit: true,
  }).action,
  "surrender",
);

const softHand = handTotal([card("A"), card("7")]);
assert.equal(hitBustOdds(softHand, [card("K"), card("5")]).busting, 0);
const hard16 = handTotal([card("10"), card("6")]);
assert.equal(hitBustOdds(hard16, [card("K"), card("A"), card("5")]).busting, 1);

const six = freshShoe(6);
const upCard = six.find((item) => item.rank === "6");
const aceCard = six.find((item) => item.rank === "A");
if (!upCard || !aceCard) throw new Error("shoe incompleto");
const unseen = six.filter((item) => item !== upCard);
const started = Date.now();
const bustRate = dealerBustProbability(upCard, unseen, false);
const elapsed = Date.now() - started;
assert.ok(bustRate > 0.38 && bustRate < 0.46, `bust 6 = ${bustRate}`);
assert.ok(elapsed < 800, `dealer bust ${elapsed}ms`);

const aceRate = dealerBustProbability(
  aceCard,
  six.filter((item) => item !== aceCard),
  false,
);
assert.ok(aceRate > 0.08 && aceRate < 0.16, `bust A = ${aceRate}`);

const shoe = createShoe(1, () => 0.5);
const cut = Math.floor(52 * (1 - (0.75 + 0.5 * 0.05)));
assert.equal(shoe.cutRemaining, cut);
let drawn = 0;
while (!needsShuffle(shoe)) {
  draw(shoe, () => 0.5);
  drawn += 1;
}
assert.equal(drawn, 52 - cut);
assert.equal(chips(1500), "15");
assert.equal(chips(-50), "-0,50");

const seats = table();
scriptShoe(seats, [
  card("K"),
  card("5"),
  card("9"),
  card("9"),
  card("6"),
  card("8"),
]);
deal(seats, [1000, 0, 1000]);
assert.equal(seats.hands.map((hand) => hand.seat).join(","), "0,2");
assert.equal(seats.phase, "player");
act(seats, "stand");
assert.equal(seats.hands[seats.active].seat, 2);
act(seats, "stand");
assert.equal(seats.phase, "done");
assert.equal(seats.dealer.length, 2);
assert.equal(seats.bankrollCents, 100_000);

const beside = table();
scriptShoe(beside, [card("10"), card("A"), card("6"), card("9"), card("K"), card("5"), card("7")]);
deal(beside, [1000, 1000]);
assert.equal(beside.hands[1].status, "blackjack");
assert.equal(beside.phase, "player");
assert.equal(beside.active, 0);
act(beside, "stand");
assert.equal(beside.phase, "done");
assert.equal(beside.bankrollCents, 102_500);

const boxes = table();
scriptShoe(boxes, [
  card("8"),
  card("8", "H"),
  card("6"),
  card("8", "D"),
  card("9"),
  card("5"),
  card("8"),
  card("8"),
  card("8"),
  card("8"),
  card("8"),
  card("8"),
]);
deal(boxes, [1000, 1000]);
let boxSplits = 0;
while (legalActions(boxes).includes("split") && boxSplits < 6) {
  act(boxes, "split");
  boxSplits += 1;
}
assert.equal(boxSplits, 3);
assert.equal(boxes.hands.filter((hand) => hand.seat === 0).length, 4);
assert.equal(pairValue(boxes.hands[boxes.active].cards), 8);
assert.equal(legalActions(boxes).includes("split"), false);

console.log("selfcheck ok");
