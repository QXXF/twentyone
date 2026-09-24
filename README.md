# Twenty-one

Blackjack nel browser con le regole di un tavolo da casinò (variante Vegas Strip) e una guida a ogni decisione. Le regole non vengono alleggerite per far vincere il giocatore: la parte didattica sta nella spiegazione, non nel risultato.

Si gioca da soli contro il banco, fino a tre posti nello stesso giro. A ogni scelta il tavolo indica la mossa della basic strategy, la probabilità di sballare se si pesca e il motivo della mossa. Se si sceglie diversamente, la mano prosegue e il registro lo segnala.

## Avvio

Serve Node.js. Dalla cartella del progetto:

```bash
npm install
npm run dev
```

Il server di sviluppo è su [http://localhost:5173](http://localhost:5173).

Altri comandi:

| Comando | Effetto |
| --- | --- |
| `npm run build` | Controlla i tipi e produce la build in `dist/` |
| `npm run preview` | Serve la build locale |
| `npm run check` | Esegue i controlli del motore in `src/selfcheck.ts` |

## Come si gioca

All’apertura il bankroll è di 1.000 fiche. Si scelgono le fiches (1, 5, 10, 25, 100) e si puntano su uno, due o tre posti. Un posto a zero resta libero. Le fiche già piazzate non possono superare il bankroll.

**Distribuisci** avvia il giro. Ogni posto riceve due carte scoperte; il banco ne ha una scoperta e una coperta. Si gioca dal primo posto al terzo, poi il banco pesca una sola volta per tutte le mani ancora in gioco.

Durante la mano i pulsanti mostrano solo le mosse legali. Gli stessi gesti sono sulla tastiera, fuori dai campi di testo:

| Tasto | Mossa |
| --- | --- |
| H | Pesca |
| S | Stai |
| D | Raddoppia |
| P | Dividi |
| R | Resa |
| A | Prendi l’assicurazione |
| N | Rifiuta l’assicurazione |

A fine giro compaiono le carte del banco, l’esito di ogni mano e la variazione del bankroll.

Dal pulsante **Tavolo** si cambiano le regole e si apre una nuova sessione. Mazzi, soft 17 e resa valgono dalla mano successiva. Il bankroll nuovo vale solo dopo **Nuova sessione**.

## Regole

Default: 6 mazzi, il banco sta sul soft 17, late surrender attiva, blackjack naturale pagato 3:2.

### Mazzo

Lo shoe mescola da 1 a 8 mazzi da 52 carte (default 6, cioè 312 carte). Il taglio cade fra il 75% e l’80% dello shoe: raggiunta quella soglia, prima della mano successiva si rimescola e il conteggio riparte da zero.

### Valore delle carte

- Dal 2 al 10: valore nominale.
- Jack, donna e re: 10.
- Asso: 1 oppure 11, scelto in modo da non sballare.

Un totale con asso contato come 11 è *soft* (per esempio asso e 6 è un soft 17).

### Distribuzione e blackjack naturale

Asso più una carta da 10 nelle prime due carte è un blackjack naturale e paga **3:2**. Un 21 ottenuto dopo lo split, o con più di due carte, è un 21 normale e paga **1:1**.

Se il banco e il giocatore hanno entrambi un blackjack naturale, la mano è un pareggio (push) e la puntata torna indietro.

Se la carta scoperta del banco è un 10 o un asso, il banco controlla la carta coperta prima che il giocatore agisca. In caso di blackjack del banco le altre mani perdono subito, salvo il pareggio fra due naturali.

### Banco

Il banco pesca fino a 16 compreso e sta su 17 o più. Sul soft 17 il default è stare; nelle impostazioni si può fargli pescare.

Se ogni mano del giocatore è già chiusa (sballo, resa o blackjack già pagato), il banco non pesca oltre la carta coperta.

### Assicurazione

Offerta solo se il banco mostra un asso, prima del controllo del blackjack. Costa metà della puntata di ogni posto occupato e paga **2:1** se il banco ha blackjack. Senza conteggio delle carte è sfavorevole: la basic strategy la rifiuta sempre.

### Raddoppio

Consentito su qualsiasi totale di due carte, anche sulle mani nate da uno split. Si aggiunge una puntata uguale a quella già in gioco e si riceve una sola carta. Sugli assi divisi il raddoppio non è consentito.

### Split

Si divide quando le prime due carte hanno lo stesso valore (le figure fra loro contano come coppia di 10). Ogni posto può arrivare a quattro mani (tre split). Ogni mano gioca da sola, con la stessa puntata della mano di origine.

Gli assi divisi ricevono una sola carta ciascuno, non si ridividono e non possono fare blackjack naturale.

### Resa

La late surrender è attiva di default: dopo il controllo del blackjack del banco, e solo sulle prime due carte di una mano non nata da uno split, si può chiudere perdendo metà puntata.

### Sballo

Un totale sopra 21 perde subito, anche se il banco sballa dopo.

### Pagamenti

| Esito | Pagamento |
| --- | --- |
| Vittoria normale | 1:1 |
| Blackjack naturale | 3:2 |
| Assicurazione vincente | 2:1 |
| Pareggio | Puntata restituita |
| Sconfitta | Puntata persa |
| Resa | Metà puntata persa |

## Cosa spiega il tavolo

A ogni decisione compaiono tre informazioni:

1. La mossa della **basic strategy**, la scelta matematicamente migliore in base alla propria mano e alla carta scoperta del banco, senza contare le carte già uscite.
2. La **probabilità di sballare** se si pesca, calcolata sulle carte ancora nello shoe (la carta coperta del banco non entra in questo conto, perché non è ancora visibile).
3. La **probabilità che il banco sballi**, esatta date la carta scoperta, le carte non viste (carta coperta inclusa) e la regola sul soft 17.

La chart vale per 4–8 mazzi, con raddoppio dopo lo split e controllo del blackjack da parte del banco. Con meno di quattro mazzi alcune celle del raddoppio cambiano: l’interfaccia lo segnala. Se il banco pesca sul soft 17, alcune celle (11 contro asso, soft 18–19, e qualche resa) seguono quella variante.

Con basic strategy perfetta, sei mazzi e banco che sta sul soft 17, il vantaggio del banco è circa lo **0,5%**. Un blackjack naturale esce circa il **4,8%** delle mani.

## Conteggio Hi-Lo

Nelle impostazioni si può mostrare il conteggio, come esercizio. Non cambia il consiglio, che resta quello della basic strategy.

- 2, 3, 4, 5, 6: +1
- 7, 8, 9: 0
- 10, figure, asso: −1

Il *running count* somma questi valori sulle carte viste. Il *true count* lo divide per i mazzi ancora nello shoe. La carta coperta del banco entra nel conteggio solo quando viene girata. Al rimescolamento entrambi tornano a zero.

Sull’assicurazione il testo dice anche se, in quello shoe, almeno un terzo delle carte non viste vale 10: è la soglia alla quale un conteggiatore la prenderebbe. La basic strategy, che non conta, continua a rifiutarla.

## Codice

TypeScript, senza framework. Vite serve la pagina; lo stato del tavolo vive nel motore, l’interfaccia lo disegna.

| File | Ruolo |
| --- | --- |
| `src/cards.ts` | Carte, totali, soft, blackjack, mescolamento, valori Hi-Lo |
| `src/shoe.ts` | Shoe, taglio, pescata, rimescolamento |
| `src/engine.ts` | Fasi della mano, puntate, split, pagamenti, bankroll |
| `src/strategy.ts` | Chart della basic strategy e testi del consiglio |
| `src/probability.ts` | Probabilità di sballo del giocatore e del banco |
| `src/ui.ts` | Tavolo, posti, impostazioni, tastiera |
| `src/main.ts` | Monta l’interfaccia su `#app` |
| `src/selfcheck.ts` | Controlli del motore, lanciati con `npm run check` |
| `architecture.md` | Specifica delle regole da cui è partito il tavolo |

Gli importi interni sono in centesimi di fiche, così i pagamenti 3:2 e la metà della resa restano interi.
