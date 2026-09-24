import { cardLabel, handTotal, isNatural, isRed, suitGlyph, type Card } from "./cards.ts";
import {
  act,
  chips,
  createTable,
  currentAdvice,
  deal,
  dealerBust,
  handTitle,
  hitOdds,
  insuranceStake,
  legalActions,
  resetSession,
  syncRules,
  takeInsurance,
  trueCount,
  type PlayerHand,
  type Table,
} from "./engine.ts";
import type { PlayerAction } from "./strategy.ts";

interface FormState {
  decks: string;
  soft17: "stand" | "hit";
  surrender: boolean;
  bankroll: string;
}

const ACTION_LABEL: Record<PlayerAction, string> = {
  hit: "Pesca",
  stand: "Stai",
  double: "Raddoppia",
  split: "Dividi",
  surrender: "Resa",
};

const KEY: Record<PlayerAction, string> = {
  hit: "H",
  stand: "S",
  double: "D",
  split: "P",
  surrender: "R",
};

const CHIP_CENTS = [100, 500, 1000, 2500, 10_000];

export function mount(root: HTMLElement): void {
  const table = createTable({
    decks: 6,
    hitSoft17: false,
    lateSurrender: true,
    bankrollCents: 100_000,
  });
  const form: FormState = {
    decks: "6",
    soft17: "stand",
    surrender: true,
    bankroll: "1000",
  };
  let chip = 1000;
  let spotBets = [1000, 0, 0];
  let editingBets = false;
  let showCount = false;
  let settingsOpen = false;
  let error = "";

  const onKey = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
    if (root.querySelector("dialog")?.hasAttribute("open")) return;
    const key = event.key.toLowerCase();
    if (table.phase === "insurance") {
      if (key === "n") pressInsurance(false);
      else if (key === "a") pressInsurance(true);
      return;
    }
    if (table.phase !== "player") return;
    const map: Record<string, PlayerAction> = {
      h: "hit",
      s: "stand",
      d: "double",
      p: "split",
      r: "surrender",
    };
    const action = map[key];
    if (!action || !legalActions(table).includes(action)) return;
    event.preventDefault();
    act(table, action);
    render(true);
  };
  document.addEventListener("keydown", onKey);

  function render(focusAction = false): void {
    if (root.querySelector("#decks")) capture();
    root.innerHTML = view(table, form, {
      chip,
      spotBets,
      editingBets,
      showCount,
      error,
    });
    bind();
    const dialog = root.querySelector<HTMLDialogElement>("#settings");
    if (settingsOpen && dialog && !dialog.open) dialog.showModal();
    if (!focusAction || settingsOpen) return;
    root.querySelector<HTMLElement>("[data-primary='true']")?.focus();
  }

  function bind(): void {
    for (const button of root.querySelectorAll<HTMLButtonElement>("[data-settings]")) {
      button.addEventListener("click", () => {
        settingsOpen = true;
        error = "";
        render(false);
      });
    }

    const dialog = root.querySelector<HTMLDialogElement>("#settings");
    dialog?.addEventListener("close", () => {
      capture();
      settingsOpen = false;
    });
    root.querySelector("#settings-close")?.addEventListener("click", () => dialog?.close());

    root.querySelector("#reset")?.addEventListener("click", () => {
      if (!newSession()) return;
      settingsOpen = false;
      render(false);
    });

    root.querySelector("#count")?.addEventListener("change", (event) => {
      showCount = (event.target as HTMLInputElement).checked;
      render(false);
    });

    for (const button of root.querySelectorAll<HTMLButtonElement>("[data-chip]")) {
      button.addEventListener("click", () => {
        chip = Number(button.dataset.chip);
        error = "";
        render(false);
      });
    }
    for (const button of root.querySelectorAll<HTMLButtonElement>("[data-add]")) {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.add);
        const available = table.bankrollCents - spotBets.reduce((sum, bet) => sum + bet, 0);
        if (chip > available) {
          error = "Fiche insufficienti per questo posto.";
          render(false);
          return;
        }
        spotBets[index] += chip;
        error = "";
        render(false);
      });
    }
    for (const button of root.querySelectorAll<HTMLButtonElement>("[data-clear]")) {
      button.addEventListener("click", () => {
        spotBets[Number(button.dataset.clear)] = 0;
        error = "";
        render(false);
      });
    }

    root.querySelector("#deal")?.addEventListener("click", () => startHand());
    root.querySelector("#again")?.addEventListener("click", () => startHand());
    root.querySelector("#edit-bets")?.addEventListener("click", () => {
      editingBets = true;
      error = "";
      render(false);
    });
    root.querySelector("#cancel-edit")?.addEventListener("click", () => {
      editingBets = false;
      error = "";
      render(false);
    });

    for (const button of root.querySelectorAll<HTMLButtonElement>("[data-action]")) {
      button.addEventListener("click", () => {
        act(table, button.dataset.action as PlayerAction);
        render(true);
      });
    }
    root.querySelector("[data-insure='no']")?.addEventListener("click", () => pressInsurance(false));
    root.querySelector("[data-insure='yes']")?.addEventListener("click", () => pressInsurance(true));
  }

  function pressInsurance(takeIt: boolean): void {
    if (takeIt && insuranceStake(table) > table.bankrollCents) return;
    takeInsurance(table, takeIt);
    render(true);
  }

  function startHand(): void {
    capture();
    const parsed = readConfig();
    if (!parsed) {
      settingsOpen = true;
      render(false);
      root.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
      return;
    }
    const total = spotBets.reduce((sum, bet) => sum + bet, 0);
    if (total <= 0) {
      error = "Aggiungi almeno una puntata.";
      render(false);
      return;
    }
    if (total > table.bankrollCents) {
      error = "La puntata supera il bankroll.";
      render(false);
      return;
    }
    const deckChange = parsed.decks !== table.decks;
    syncRules(table, parsed);
    deal(table, spotBets);
    if (deckChange) table.log.unshift(`Nuovo shoe: ${table.decks} mazzi.`);
    editingBets = false;
    error = "";
    render(true);
  }

  function newSession(): boolean {
    capture();
    const parsed = readConfig();
    if (!parsed) {
      settingsOpen = true;
      render(false);
      root.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
      return false;
    }
    resetSession(table, {
      decks: parsed.decks,
      hitSoft17: parsed.hitSoft17,
      lateSurrender: parsed.lateSurrender,
      bankrollCents: parsed.bankrollCents,
    });
    spotBets = [Math.min(1000, parsed.bankrollCents), 0, 0];
    editingBets = false;
    error = "";
    return true;
  }

  function capture(): void {
    const decks = root.querySelector<HTMLInputElement>("#decks");
    if (!decks) return;
    form.decks = decks.value;
    form.soft17 = root.querySelector<HTMLInputElement>("input[name='soft17']:checked")?.value === "hit" ? "hit" : "stand";
    form.surrender = root.querySelector<HTMLInputElement>("#surrender")?.checked ?? false;
    form.bankroll = root.querySelector<HTMLInputElement>("#bankroll")?.value ?? form.bankroll;
  }

  function readConfig(): {
    decks: number;
    hitSoft17: boolean;
    lateSurrender: boolean;
    bankrollCents: number;
  } | null {
    const decks = Number(form.decks);
    const bankroll = Number(form.bankroll);
    const decksOk = Number.isInteger(decks) && decks >= 1 && decks <= 8;
    const moneyOk = Number.isInteger(bankroll) && bankroll >= 1;
    if (!decksOk || !moneyOk) {
      error = "Mazzi da 1 a 8. Il bankroll è un intero, almeno 1.";
      return null;
    }
    error = "";
    return {
      decks,
      hitSoft17: form.soft17 === "hit",
      lateSurrender: form.surrender,
      bankrollCents: bankroll * 100,
    };
  }

  render(false);
}

function view(
  table: Table,
  form: FormState,
  ui: { chip: number; spotBets: number[]; editingBets: boolean; showCount: boolean; error: string },
): string {
  const placing = table.phase === "bet" || ui.editingBets;
  const net = table.bankrollCents - table.startBankrollCents;
  const advice = currentAdvice(table);
  const bust = hitOdds(table);
  const dealer = dealerBust(table);
  return `
    <div class="table-app">
      <header class="rail">
        <h1>Blackjack</h1>
        <p class="bank">Bankroll <strong>${chips(table.bankrollCents)}</strong> <span class="net ${net > 0 ? "win" : net < 0 ? "loss" : ""}">netto ${signed(net)}</span></p>
        ${ui.showCount ? `<p class="count">Hi-Lo <strong>${formatCount(table.runningCount)}</strong> · true <strong>${formatCount(trueCount(table))}</strong></p>` : ""}
        <button type="button" class="btn" data-settings>Regole</button>
      </header>
      <main class="felt">
        ${dealerBlock(table)}
        <div class="spots">
          ${[0, 1, 2].map((seat) => seatBlock(table, seat, ui.spotBets, ui.chip, ui.editingBets, advice, bust, dealer)).join("")}
        </div>
        ${table.phase === "insurance" ? insuranceBlock(table, advice) : ""}
      </main>
      <footer class="tray">
        ${tray(table, ui, placing)}
      </footer>
      ${settingsDialog(form, ui.showCount, ui.error)}
    </div>
  `;
}

function seatBlock(
  table: Table,
  seat: number,
  spotBets: number[],
  chip: number,
  editingBets: boolean,
  advice: ReturnType<typeof currentAdvice>,
  bust: ReturnType<typeof hitOdds>,
  dealer: number | null,
): string {
  const placing = table.phase === "bet" || editingBets;
  const hands = table.hands.filter((hand) => hand.seat === seat);
  if (placing) return placeSpot(table, seat, spotBets, chip);
  if (hands.length === 0) {
    return `<article class="spot is-empty"><h2>Posto ${seat + 1}</h2><p class="empty">Libero</p></article>`;
  }
  const active = hands.some((_, index) => table.hands.indexOf(hands[index]) === table.active && table.phase === "player");
  return `
    <article class="spot${active ? " is-active" : ""}">
      <h2>Posto ${seat + 1}</h2>
      ${hands.map((hand) => handBlock(table, hand, advice, bust, dealer)).join("")}
    </article>
  `;
}

function placeSpot(table: Table, seat: number, spotBets: number[], chip: number): string {
  const bet = spotBets[seat] ?? 0;
  const reserved = spotBets.reduce((sum, value) => sum + value, 0);
  const afford = chip <= table.bankrollCents - reserved;
  const label = bet > 0 ? chips(bet) : "Punta";
  const name = `${label} sul posto ${seat + 1}, aggiungi ${chips(chip)}`;
  return `
    <article class="spot is-placing${bet > 0 ? " has-bet" : ""}">
      <h2>Posto ${seat + 1}</h2>
      <button type="button" class="bet-circle" data-add="${seat}"${afford ? "" : " disabled"} aria-label="${esc(name)}">${esc(label)}</button>
      ${bet > 0 ? `<button type="button" class="btn" data-clear="${seat}">Togli</button>` : ""}
    </article>
  `;
}

function handBlock(
  table: Table,
  hand: PlayerHand,
  advice: ReturnType<typeof currentAdvice>,
  bust: ReturnType<typeof hitOdds>,
  dealer: number | null,
): string {
  const index = table.hands.indexOf(hand);
  const active = table.phase === "player" && index === table.active && hand.status === "open";
  const outcome = table.outcomes.find((item) => item.title === handTitle(table, hand));
  const mates = table.hands.filter((item) => item.seat === hand.seat).length;
  return `
    <div class="hand${active ? " is-turn" : ""}"${active ? ' aria-current="true"' : ""}>
      ${mates > 1 ? `<h3>${esc(handTitle(table, hand))}</h3>` : ""}
      <p class="stake">${chips(hand.betCents)} fiche</p>
      <div class="cards">${hand.cards.map(cardView).join("")}</div>
      <p class="total">Totale ${esc(totalText(hand.cards))}</p>
      ${outcome ? resultLine(outcome.detail, outcome.netCents) : `<p class="status">${statusText(hand)}</p>`}
      ${active ? decisionBlock(table, advice, bust, dealer, hand) : ""}
    </div>
  `;
}

function decisionBlock(
  table: Table,
  advice: ReturnType<typeof currentAdvice>,
  bust: ReturnType<typeof hitOdds>,
  dealer: number | null,
  hand: PlayerHand,
): string {
  const legal = legalActions(table);
  const buttons = legal
    .map((action) => {
      const primary = advice?.action === action;
      return `<button type="button" class="btn${primary ? " btn-primary" : ""}" data-action="${action}" aria-keyshortcuts="${KEY[action]}"${primary ? ' data-primary="true"' : ""}>${ACTION_LABEL[action]}</button>`;
    })
    .join("");
  const bustText = bustTextOf(bust, hand);
  const dealerText = dealer === null ? "" : `Il banco sballa circa il ${pct(dealer)}.`;
  const caveat = table.decks < 4 ? " Chart da 4–8 mazzi: con meno mazzi alcune raddoppiate cambiano." : "";
  return `
    <div class="decision">
      <p class="turn">Tocca a te</p>
      <div class="actions" role="group" aria-label="Decisioni" aria-describedby="coach-why">${buttons}</div>
      ${
        advice
          ? `<div class="coach">
              <p class="advice"><span class="advice-label">Consiglio</span> ${esc(advice.label)}</p>
              <p id="coach-why">${esc(advice.why)}${esc(caveat)}</p>
              ${bustText ? `<p class="odds">${esc(bustText)}</p>` : ""}
              ${dealerText ? `<p class="odds">${esc(dealerText)}</p>` : ""}
            </div>`
          : ""
      }
    </div>
  `;
}

function insuranceBlock(table: Table, advice: ReturnType<typeof currentAdvice>): string {
  const cost = insuranceStake(table);
  const poor = cost > table.bankrollCents;
  const seats = table.hands.length > 1 ? ` su ${table.hands.length} posti` : "";
  return `
    <div class="decision decision-table">
      <p class="turn">Assicurazione</p>
      <div class="actions" role="group" aria-label="Assicurazione" aria-describedby="coach-why">
        <button type="button" class="btn btn-primary" data-insure="no" data-primary="true" aria-keyshortcuts="N">Rifiuta</button>
        <button type="button" class="btn" data-insure="yes" aria-keyshortcuts="A"${poor ? " disabled" : ""}>Assicurati${seats}${poor ? "" : ` · ${chips(cost)}`}</button>
      </div>
      ${
        advice
          ? `<div class="coach"><p class="advice"><span class="advice-label">Consiglio</span> ${esc(advice.label)}</p><p id="coach-why">${esc(advice.why)}</p></div>`
          : ""
      }
    </div>
  `;
}

function dealerBlock(table: Table): string {
  if (table.dealer.length === 0) {
    return `
      <section class="dealer" aria-label="Banco">
        <h2>Banco</h2>
        <div class="cards">${faceDown("Banco in attesa")}</div>
      </section>
    `;
  }
  const hole = table.holeRevealed ? cardView(table.dealer[1]) : faceDown();
  const total = table.holeRevealed ? `Totale ${totalText(table.dealer)}` : `Mostra ${cardLabel(table.dealer[0])}`;
  return `
    <section class="dealer" aria-label="Banco">
      <h2>Banco</h2>
      <div class="cards">${cardView(table.dealer[0])}${hole}${table.dealer.slice(2).map(cardView).join("")}</div>
      <p class="total">${esc(total)}</p>
    </section>
  `;
}

function tray(
  table: Table,
  ui: { chip: number; spotBets: number[]; editingBets: boolean; error: string },
  placing: boolean,
): string {
  const broke = table.bankrollCents <= 0;
  const last = table.log[table.log.length - 1] ?? "";
  const ticker = last
    ? `<p class="ticker" aria-live="polite">${esc(last)}</p>`
    : `<p class="ticker">Tre posti. Scegli la fiche, puntala, distribuisci.</p>`;
  const insurance = table.outcomes.find((item) => item.title === "Assicurazione");
  const shuffle = needsShuffleReady(table) ? `<p class="ticker">Taglio raggiunto: la prossima mano usa uno shoe nuovo.</p>` : "";
  let controls = "";
  if (placing) {
    const chipsRow = CHIP_CENTS.map((value) => {
      const selected = value === ui.chip;
      return `<button type="button" class="chip${selected ? " is-selected" : ""}" data-chip="${value}" aria-pressed="${selected ? "true" : "false"}"${value > table.bankrollCents ? " disabled" : ""}>${chips(value)}</button>`;
    }).join("");
    controls = `
      <div class="tray-row">
        <div class="chips" role="group" aria-label="Valore fiche">${chipsRow}</div>
        <div class="actions">
          ${broke ? "" : `<button type="button" class="btn btn-primary" id="deal" data-primary="true">Distribuisci</button>`}
          ${table.phase === "done" ? `<button type="button" class="btn" id="cancel-edit">Torna alla mano</button>` : ""}
          ${broke ? `<button type="button" class="btn btn-primary" data-settings>Nuova sessione</button>` : ""}
        </div>
      </div>
    `;
  } else if (table.phase === "done") {
    const overBet = spotTotal(ui.spotBets) > table.bankrollCents;
    controls = `
      <div class="tray-row">
        <p class="round-net">Questa mano ${signed(table.roundNetCents)}</p>
        <div class="actions">
          ${broke ? `<button type="button" class="btn btn-primary" data-settings>Nuova sessione</button>` : ""}
          ${broke || overBet ? "" : `<button type="button" class="btn btn-primary" id="again" data-primary="true">Rigioca</button>`}
          <button type="button" class="btn" id="edit-bets">Cambia puntate</button>
        </div>
      </div>
      ${overBet && !broke ? `<p class="form-error">La puntata sui posti supera il bankroll.</p>` : ""}
    `;
  }
  const log = table.log.length
    ? `<details class="chronicle"><summary>Cronaca</summary><ol>${table.log.map((line) => `<li>${esc(line)}</li>`).join("")}</ol></details>`
    : "";
  return `
    ${ticker}
    ${shuffle}
    ${insurance && table.phase === "done" ? `<p class="ticker">${esc(insurance.detail)} <strong>${signed(insurance.netCents)}</strong></p>` : ""}
    ${ui.error ? `<p class="form-error" role="alert">${esc(ui.error)}</p>` : ""}
    ${broke && !placing ? `<p role="status">Bankroll a zero.</p>` : ""}
    ${controls}
    ${log}
  `;
}

function settingsDialog(form: FormState, showCount: boolean, error: string): string {
  const invalid = error.startsWith("Mazzi");
  return `
    <dialog id="settings" aria-labelledby="settings-title">
      <h2 id="settings-title">Tavolo</h2>
      <p class="dialog-note">Queste scelte valgono dalla prossima mano. Il bankroll si applica solo a una nuova sessione.</p>
      <div class="fields">
        <label for="decks">Mazzi</label>
        <input id="decks" type="number" min="1" max="8" step="1" inputmode="numeric" value="${esc(form.decks)}"${invalid ? ' aria-invalid="true" aria-describedby="form-error"' : ""} />
        <fieldset class="inline">
          <legend>Soft 17 del banco</legend>
          <label class="check"><input type="radio" name="soft17" value="stand"${form.soft17 === "stand" ? " checked" : ""} /> Sta</label>
          <label class="check"><input type="radio" name="soft17" value="hit"${form.soft17 === "hit" ? " checked" : ""} /> Pesca</label>
        </fieldset>
        <label class="check"><input id="surrender" type="checkbox"${form.surrender ? " checked" : ""} /> Late surrender</label>
        <label for="bankroll">Bankroll nuova sessione</label>
        <input id="bankroll" type="number" min="1" step="1" inputmode="numeric" value="${esc(form.bankroll)}" />
        <label class="check"><input id="count" type="checkbox"${showCount ? " checked" : ""} /> Mostra il conteggio Hi-Lo</label>
      </div>
      ${showCount ? `<p class="dialog-note">2–6 valgono +1, 7–9 valgono 0, 10 e assi valgono −1. Il true count divide il running per i mazzi ancora nello shoe. La carta coperta entra quando si gira. Il consiglio resta la basic strategy.</p>` : ""}
      ${invalid ? `<p id="form-error" class="form-error" role="alert">${esc(error)}</p>` : ""}
      <div class="actions">
        <button type="button" class="btn btn-primary" id="settings-close">Chiudi</button>
        <button type="button" class="btn" id="reset">Nuova sessione</button>
      </div>
      <details class="rules">
        <summary>Come si gioca</summary>
        <div class="rules-body">
          <p>Sei mazzi, il banco sta sul soft 17, resa tardiva, blackjack 3:2. Puoi occupare fino a tre posti: si gioca dal primo al terzo, poi il banco pesca una volta.</p>
          <p>Figure valgono 10, l’asso 1 o 11. Assicurazione solo con l’asso scoperto, metà puntata, paga 2:1, sfavorevole senza conteggio. Raddoppio su qualsiasi due carte, anche dopo lo split. Split fino a quattro mani per posto; gli assi divisi prendono una carta sola e un 21 paga 1:1.</p>
          <p>Tasti durante la mano: H pesca, S stai, D raddoppia, P dividi, R resa, N rifiuta l’assicurazione, A assicurati.</p>
        </div>
      </details>
    </dialog>
  `;
}

function resultLine(detail: string, netCents: number): string {
  const kind = netCents > 0 ? "win" : netCents < 0 ? "loss" : "push";
  return `<p class="result ${kind}">${esc(detail)} <strong>${signed(netCents)}</strong></p>`;
}

function spotTotal(bets: number[]): number {
  return bets.reduce((sum, bet) => sum + bet, 0);
}

function cardView(card: Card): string {
  const red = isRed(card.suit) ? " red" : "";
  return `<span class="card${red}" role="img" aria-label="${esc(cardLabel(card))}"><span class="rank">${esc(card.rank)}</span><span class="suit" aria-hidden="true">${suitGlyph(card.suit)}</span></span>`;
}

function faceDown(label = "Carta coperta del banco"): string {
  return `<span class="card back" role="img" aria-label="${esc(label)}"></span>`;
}

function totalText(cards: Card[]): string {
  const total = handTotal(cards);
  return total.soft ? `soft ${total.total}` : String(total.total);
}

function statusText(hand: PlayerHand): string {
  if (hand.status === "bust") return "Sballo";
  if (hand.status === "surrender") return "Resa";
  if (hand.status === "blackjack") return "Blackjack";
  if (hand.status === "stand") return hand.aceSplit ? "Asso diviso" : "Sta";
  return "In gioco";
}

function bustTextOf(bust: ReturnType<typeof hitOdds>, hand: PlayerHand | undefined): string {
  if (!bust || !hand) return "";
  if (isNatural(hand.cards) && !hand.fromSplit) return "";
  if (bust.remaining === 0) return "Nello shoe non restano carte.";
  const total = handTotal(hand.cards);
  if (total.soft && bust.busting === 0) return "Pescando ora non sballi: l’asso può valere 1.";
  return `Pescando sballi con ${bust.busting} carte su ${bust.remaining} (${pct(bust.busting / bust.remaining)}).`;
}

function pct(value: number): string {
  return `${(Math.round(value * 1000) / 10).toFixed(1).replace(".", ",")}%`;
}

function signed(cents: number): string {
  if (cents > 0) return `+${chips(cents)}`;
  return chips(cents);
}

function formatCount(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const text = rounded.toFixed(1).replace(".", ",");
  if (rounded > 0) return `+${text}`;
  return text;
}

function esc(value: string): string {
  return value.replace(/[&<>"]/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    return "&quot;";
  });
}

function needsShuffleReady(table: Table): boolean {
  return table.phase === "done" && table.shoe.cards.length <= table.shoe.cutRemaining && !table.shoe.scripted;
}
