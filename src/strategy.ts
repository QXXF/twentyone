import { cardValue, handTotal, pairValue, upName, type Card } from "./cards.ts";

// ponytail: total-dependent chart for 4–8 decks, DAS, dealer peek. One and two decks shift a few doubles; the UI says so when decks < 4.

/** Dealer upcard column: 2,3,4,5,6,7,8,9,10,A */
export function upIndex(card: Card): number {
  if (card.rank === "A") return 9;
  return cardValue(card) - 2;
}

export type PlayerAction = "hit" | "stand" | "double" | "split" | "surrender";

type ChartPlay = "H" | "S" | "Dh" | "Ds";

const HARD: Record<number, ChartPlay[]> = {
  9: ["H", "Dh", "Dh", "Dh", "Dh", "H", "H", "H", "H", "H"],
  10: ["Dh", "Dh", "Dh", "Dh", "Dh", "Dh", "Dh", "Dh", "H", "H"],
  11: ["Dh", "Dh", "Dh", "Dh", "Dh", "Dh", "Dh", "Dh", "Dh", "H"],
  12: ["H", "H", "S", "S", "S", "H", "H", "H", "H", "H"],
  13: ["S", "S", "S", "S", "S", "H", "H", "H", "H", "H"],
  14: ["S", "S", "S", "S", "S", "H", "H", "H", "H", "H"],
  15: ["S", "S", "S", "S", "S", "H", "H", "H", "H", "H"],
  16: ["S", "S", "S", "S", "S", "H", "H", "H", "H", "H"],
};

/** Soft total → plays. Six-deck, dealer stands on soft 17, double after split. */
const SOFT: Record<number, ChartPlay[]> = {
  13: ["H", "H", "H", "H", "Dh", "H", "H", "H", "H", "H"],
  14: ["H", "H", "H", "Dh", "Dh", "H", "H", "H", "H", "H"],
  15: ["H", "H", "H", "Dh", "Dh", "H", "H", "H", "H", "H"],
  16: ["H", "H", "Dh", "Dh", "Dh", "H", "H", "H", "H", "H"],
  17: ["H", "Dh", "Dh", "Dh", "Dh", "H", "H", "H", "H", "H"],
  18: ["S", "Ds", "Ds", "Ds", "Ds", "S", "S", "H", "H", "H"],
  19: ["S", "S", "S", "S", "S", "S", "S", "S", "S", "S"],
  20: ["S", "S", "S", "S", "S", "S", "S", "S", "S", "S"],
  21: ["S", "S", "S", "S", "S", "S", "S", "S", "S", "S"],
};

/**
 * Pair value (ace = 1) → "P" split or "." fall through.
 * Assumes double after split, so Ph cells are splits.
 */
const PAIRS: Record<number, string> = {
  1: "PPPPPPPPPP",
  2: "PPPPPPHHHH",
  3: "PPPPPPHHHH",
  4: "HHHPPHHHHH",
  6: "PPPPPHHHHH",
  7: "PPPPPPHHHH",
  8: "PPPPPPPPPP",
  9: "PPPPPSPPSS",
};

export interface AdviceInput {
  cards: Card[];
  hitSoft17: boolean;
  /** Rules allow the move on this hand (not bankroll). */
  rulesDouble: boolean;
  rulesSplit: boolean;
  rulesSurrender: boolean;
  affordDouble: boolean;
  affordSplit: boolean;
  upcard: Card;
}

export interface Advice {
  action: PlayerAction;
  label: string;
  why: string;
}

const LABEL: Record<PlayerAction, string> = {
  hit: "Pesca",
  stand: "Stai",
  double: "Raddoppia",
  split: "Dividi",
  surrender: "Resa",
};

export function advise(input: AdviceInput): Advice {
  const total = handTotal(input.cards);
  const up = upIndex(input.upcard);
  const pair = pairValue(input.cards);
  const chart = chartAction(input, total.total, total.soft, pair, up);
  const action = legalize(chart, input, total.total, total.soft, pair, up);
  return {
    action,
    label: LABEL[action],
    why: explain(action, chart, input, total.total, total.soft, pair),
  };
}

function chartAction(
  input: AdviceInput,
  total: number,
  soft: boolean,
  pair: number | null,
  up: number,
): PlayerAction {
  if (pair !== null && input.rulesSplit && shouldSplit(pair, up, input)) return "split";
  if (!soft && input.rulesSurrender && shouldSurrender(total, up, input.hitSoft17)) return "surrender";
  return playToAction(basePlay(total, soft, up, input.hitSoft17), input.rulesDouble);
}

function shouldSplit(pair: number, up: number, input: AdviceInput): boolean {
  if (pair === 5 || pair === 10) return false;
  if (pair === 8 && input.hitSoft17 && input.rulesSurrender && up === 9) return false;
  const row = PAIRS[pair];
  return row ? row[up] === "P" : false;
}

function shouldSurrender(total: number, up: number, hitSoft17: boolean): boolean {
  if (total === 16 && (up === 7 || up === 8 || up === 9)) return true;
  if (total === 15 && up === 8) return true;
  if (hitSoft17 && total === 15 && up === 9) return true;
  if (hitSoft17 && total === 17 && up === 9) return true;
  return false;
}

function basePlay(total: number, soft: boolean, up: number, hitSoft17: boolean): ChartPlay {
  if (soft) {
    const row = SOFT[total];
    let play = row ? row[up] : "H";
    if (hitSoft17 && total === 18 && up === 0) play = "Ds";
    if (hitSoft17 && total === 19 && up === 4) play = "Ds";
    return play;
  }
  if (total <= 8) return "H";
  if (total >= 17) return "S";
  let play = HARD[total][up];
  if (hitSoft17 && total === 11 && up === 9) play = "Dh";
  return play;
}

function playToAction(play: ChartPlay, canDouble: boolean): PlayerAction {
  if (play === "H") return "hit";
  if (play === "S") return "stand";
  if (play === "Dh") return canDouble ? "double" : "hit";
  return canDouble ? "double" : "stand";
}

function legalize(
  chart: PlayerAction,
  input: AdviceInput,
  total: number,
  soft: boolean,
  pair: number | null,
  up: number,
): PlayerAction {
  if (chart === "split" && input.affordSplit) return "split";
  if (chart === "surrender" && input.rulesSurrender) return "surrender";
  if (chart === "double" && input.affordDouble) return "double";
  if (chart === "hit" || chart === "stand") return chart;
  if (chart === "split") {
    const without = chartAction(
      { ...input, rulesSplit: false },
      total,
      soft,
      pair,
      up,
    );
    return legalize(without, { ...input, rulesSplit: false }, total, soft, pair, up);
  }
  if (chart === "surrender") return total >= 17 ? "stand" : "hit";
  const play = basePlay(total, soft, up, input.hitSoft17);
  if (play === "Ds" || play === "S") return "stand";
  return "hit";
}

export function insuranceAdvice(tenCards: number, unseen: number): Advice {
  const share = unseen === 0 ? 0 : tenCards / unseen;
  const pct = Math.round(share * 1000) / 10;
  let why =
    "L'assicurazione paga 2:1 e conviene solo se almeno un terzo delle carte coperte vale 10. " +
    `Nello shoe, adesso, le carte da 10 sono il ${pct}% di quelle non viste. ` +
    "La basic strategy non conta le carte e rifiuta sempre l'assicurazione: sul lungo periodo favorisce il banco.";
  if (share > 1 / 3) {
    why +=
      " In questo shoe la soglia è superata: un conteggiatore la prenderebbe. La basic strategy, senza conteggio, la rifiuta comunque.";
  }
  return { action: "stand", label: "Rifiuta l'assicurazione", why };
}

function explain(
  action: PlayerAction,
  chart: PlayerAction,
  input: AdviceInput,
  total: number,
  soft: boolean,
  pair: number | null,
): string {
  const up = upName(input.upcard);
  let text = reason(action, total, soft, pair, up, input.hitSoft17);
  if (chart === "double" && action !== "double" && input.rulesDouble && !input.affordDouble) {
    text += " La chart raddoppierebbe, ma serve una puntata extra uguale a quella già in gioco.";
  }
  if (chart === "split" && action !== "split" && !input.affordSplit) {
    text += " La chart dividerebbe, ma non hai fiche sufficienti per la seconda mano.";
  }
  return text;
}

function reason(
  action: PlayerAction,
  total: number,
  soft: boolean,
  pair: number | null,
  up: string,
  hitSoft17: boolean,
): string {
  if (action === "split" && pair === 1) {
    return "Due assi divisi partono entrambi da 11. Ricevi una sola carta per mano: un 21 paga 1:1, non 3:2, e non puoi pescare né raddoppiare.";
  }
  if (action === "split" && pair === 8) {
    return "8+8 fa 16, uno dei totali peggiori. Due mani da 8 si giocano meglio, anche contro una carta alta.";
  }
  if (action === "split" && pair === 9) {
    return `18 contro ${up} rende di più come due mani da 9, tranne contro 7, 10 e asso, dove il 18 si tiene intero.`;
  }
  if (action === "split" && pair === 4) {
    return "4+4 è un 8, da pescare. Contro 5 o 6, con il raddoppio dopo lo split, due mani da 4 valgono di più.";
  }
  if (action === "split") {
    return `Contro il ${up} del banco due mani separate hanno un valore atteso migliore del totale unito.`;
  }
  if (action === "surrender") {
    return `Con ${total} contro ${up} giocare perde in media più di metà puntata. La resa chiude la mano pagando quel prezzo, dopo il controllo blackjack del banco.`;
  }
  if (action === "double" && !soft && total === 11) {
    if (hitSoft17 && up === "asso") {
      return "Se il banco pesca sul soft 17, l'11 contro l'asso si raddoppia: il banco sborda più spesso.";
    }
    return "11 più una carta non sballa e spesso chiude un totale alto. Si aumenta la puntata.";
  }
  if (action === "double" && !soft && total === 10) {
    return "10 si raddoppia quando il banco non mostra 10 o asso: una carta in più parte avvantaggiata e non puoi sballare.";
  }
  if (action === "double" && !soft && total === 9) {
    return "9 si raddoppia solo contro 3, 4, 5 e 6, dove il banco è vulnerabile.";
  }
  if (action === "double" && soft) {
    return "La mano è soft: una carta in più non ti fa sballare, perché l'asso può tornare a valere 1. Contro una carta debole si aumenta la puntata.";
  }
  if (action === "stand" && soft && total === 18) {
    return `Soft 18 contro ${up} si tiene. Pescare o raddoppiare non migliora il valore atteso.`;
  }
  if (action === "stand" && soft) {
    return "19 o più, anche soft, è già una mano forte. Si sta.";
  }
  if (action === "hit" && soft && total === 18) {
    return "Soft 18 contro una carta alta è debole. Pescando puoi salire, e se la carta è alta l'asso torna a 1: resti in gioco.";
  }
  if (action === "hit" && soft) {
    return "Sotto soft 18 si pesca, o si raddoppia solo contro le carte deboli indicate dalla chart. Una carta non ti fa sballare.";
  }
  if (action === "stand" && total >= 17) {
    return "Da 17 in su si sta. Pescare rischia lo sballo immediato e il guadagno atteso non compensa.";
  }
  if (action === "stand") {
    return `Il banco mostra ${up}, una carta debole, e sballa spesso per arrivare a 17. Stare evita di sballare tu per primo.`;
  }
  if (total === 12 && (up === "2" || up === "3")) {
    return `12 contro ${up} è un'eccezione: il banco non è abbastanza debole e tu sballi solo con un 10. Si pesca.`;
  }
  if (total === 11 && up === "asso" && !hitSoft17) {
    return "Contro l'asso, con sei mazzi e il banco fermo sul soft 17, l'11 si pesca senza raddoppiare.";
  }
  return `Contro ${up} il banco chiude spesso un totale alto. Stare perde troppo spesso: si pesca, anche se lo sballo è concreto.`;
}
