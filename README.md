# Ice Cream Empire

Ice Cream Empire e un gioco didattico multiplayer per simulare la gestione di
una catena di gelaterie. Il progetto e pensato per un contesto classroom:
un docente crea una stanza, le squadre entrano con un codice, prendono decisioni
di marketing trimestre per trimestre e confrontano i risultati su ricavi,
profitto, quota di mercato, soddisfazione e cassa.

Il gioco aiuta a ragionare su trade-off reali: prodotto, prezzo, quartiere,
budget pubblicitari, ricerche di mercato, stagionalita, eventi, concorrenza e
vincoli di liquidita.

## Funzionalita Principali

- Stanza multiplayer con codice breve e ruolo docente/squadra.
- Fino a 10 squadre per partita.
- Partita su 12 trimestri, equivalenti a 3 anni.
- Cassa iniziale di 30.000 euro per squadra.
- Scelta di prodotto, fascia prezzo, quartiere e budget su Google, Meta e
  Influencer.
- Ricerche acquistabili per rivelare informazioni di mercato prima della scelta.
- Quartiere bloccato per l'anno in corso: la scelta del Q1 resta valida per Q2,
  Q3 e Q4 dello stesso anno.
- Timer di turno di 5 minuti lato interfaccia.
- Invio automatico di una decisione di fallback per chi non ha inviato prima
  dell'avanzamento del docente.
- Classifica, risultati pubblici, storico cassa e breakdown economico per la
  squadra corrente.
- Persistenza su Cloudflare D1 tramite Drizzle ORM.

## Come Si Gioca

1. Il docente entra come istruttore, inserisce il proprio nome e crea una stanza.
2. Il sistema genera un codice stanza di 5 caratteri.
3. Le squadre entrano come giocatori usando il codice e un nickname.
4. Il docente avvia la partita dalla lobby.
5. A ogni trimestre, ogni squadra:
   - consulta scenario, stagione ed evento;
   - compra eventuali ricerche di mercato;
   - sceglie prodotto, prezzo, quartiere e budget pubblicitari;
   - invia la decisione.
6. Il docente avanza il trimestre. Se alcune squadre non hanno inviato, il server
   inserisce una decisione predefinita.
7. Il server calcola risultati e classifica.
8. Dopo 12 trimestri la stanza passa allo stato `complete`.

La guida pubblica del gioco si trova in `public/guida.html`.

## Stack Tecnico

- Next.js 16 con App Router.
- React 19.
- TypeScript.
- vinext per eseguire Next.js su Cloudflare Workers.
- Vite con plugin Cloudflare.
- Cloudflare D1 come database SQLite serverless.
- Drizzle ORM e Drizzle Kit per schema e migrazioni.
- Tailwind CSS 4 tramite `@import "tailwindcss"`.

## Requisiti

- Node.js `>=22.13.0`
- npm

Il progetto usa una binding D1 chiamata `DB`, configurata in
`.openai/hosting.json` e simulata in locale da `vite.config.ts`.

## Avvio Locale

Installa le dipendenze:

```bash
npm install
```

Avvia il server di sviluppo:

```bash
npm run dev
```

Verifica la build:

```bash
npm run build
```

Avvia la build prodotta:

```bash
npm run start
```

Esegui il lint:

```bash
npm run lint
```

Genera una nuova migrazione Drizzle dopo modifiche a `db/schema.ts`:

```bash
npm run db:generate
```

## Struttura Del Repository

```text
app/
  api/game/route.ts    API del gioco: stanze, join, ricerche, decisioni, avanzamento
  game-client.tsx      Interfaccia client e stato dell'esperienza multiplayer
  globals.css          Stili globali e layout dell'app
  layout.tsx           Metadata, font e root layout
  page.tsx             Entry point della home

db/
  index.ts             Accesso a Cloudflare D1 e inizializzazione Drizzle
  schema.ts            Tabelle Drizzle del dominio di gioco

lib/
  game.ts              Motore di simulazione, opzioni, validazione e scoring

drizzle/
  *.sql                Migrazioni generate
  meta/                Snapshot Drizzle

public/
  guida.html           Guida utente pubblica
  screenshot.jpeg      Screenshot usato nella splash page
  *.svg                Icone e favicon

worker/
  index.ts             Entry point Cloudflare Worker per vinext

build/
  sites-vite-plugin.ts Plugin di build per l'ambiente Sites
```

## Modello Dati

Lo schema principale e definito in `db/schema.ts`.

- `rooms`: stanza di gioco, codice, docente, token host, seed, stato e trimestre
  corrente.
- `players`: squadre iscritte alla stanza, token privato, ricavi/profitti e
  soddisfazione cumulati.
- `market_snapshots`: scenario di mercato generato per stanza e trimestre.
- `research_purchases`: ricerche acquistate da una squadra in un trimestre.
- `quarter_decisions`: decisione inviata da una squadra per un trimestre.
- `quarter_results`: risultati economici e driver calcolati per una squadra.

La route API crea anche le tabelle con `CREATE TABLE IF NOT EXISTS` in
`ensureGameSchema()`. Questo rende il gioco piu resiliente in ambienti dove le
migrazioni non sono ancora state applicate, ma lo schema sorgente resta
`db/schema.ts`.

## API Del Gioco

Tutte le operazioni passano da `/api/game`.

### `GET /api/game`

Parametri query:

- `roomCode`: codice stanza obbligatorio.
- `playerToken`: token squadra, opzionale.
- `hostToken`: token docente, opzionale.

Restituisce lo stato completo della stanza, adattato al ruolo. Il docente vede
tutte le ricerche di mercato; una squadra vede solo i dati che ha acquistato.

### `POST /api/game`

Il corpo JSON deve includere `action`.

Azioni supportate:

- `createRoom`: crea una stanza.
  - Campi: `instructorName`
- `joinRoom`: aggiunge una squadra alla lobby.
  - Campi: `roomCode`, `nickname`
- `purchaseResearch`: compra una ricerca per il trimestre corrente.
  - Campi: `roomCode`, `playerToken`, `researchType`
- `submitDecision`: invia la scelta della squadra.
  - Campi: `roomCode`, `playerToken`, `decision`, `autoSubmit`
- `advanceQuarter`: azione docente per avviare o avanzare la partita.
  - Campi: `roomCode`, `hostToken`

I messaggi di errore restituiti dall'API sono in italiano per essere mostrati
direttamente nell'interfaccia.

## Motore Di Simulazione

Il cuore del bilanciamento e in `lib/game.ts`.

### Opzioni di decisione

Prodotti:

- `classic`: gusti affidabili per famiglie e lavoratori.
- `premium`: ingredienti artigianali e percezione di qualita piu alta.
- `novelty`: edizioni limitate e gusti adatti ai social.
- `healthy`: opzioni vegan, low sugar e wellness.

Prezzi:

- `low`: prezzo 3,20 euro, margine 45%.
- `standard`: prezzo 4,40 euro, margine 56%.
- `premium`: prezzo 5,80 euro, margine 64%.
- `luxury`: prezzo 7,20 euro, margine 70%.

Quartieri:

- `downtown`
- `campus`
- `park`
- `station`
- `oldtown`

Canali pubblicitari:

- Google
- Meta
- Influencer

Ricerche:

- `traffic`: rivela il traffico dei quartieri.
- `segments`: rivela preferenze di segmenti e tolleranza al prezzo.
- `channels`: rivela la resa prevista dei canali pubblicitari.
- `competitors`: rivela posizionamento e performance dei concorrenti.

### Calcolo del trimestre

Per ogni squadra il server calcola:

- fit prodotto/segmenti del quartiere;
- fit prezzo/segmenti;
- domanda base del trimestre;
- traffico del quartiere;
- lift pubblicitario con rendimenti decrescenti;
- affollamento causato da squadre nello stesso quartiere;
- ricavi, costi prodotto, affitto, spese pubblicitarie, spese ricerca;
- profitto, soddisfazione e quota di mercato.

La funzione principale e `evaluateQuarter()`. La funzione `projectQuarter()`
riusa la stessa logica per mostrare al client una previsione prima dell'invio,
con intervalli piu larghi quando alcuni dati di mercato non sono stati acquistati.

## Persistenza, Sessioni E Token

La sessione utente e gestita lato client tramite token restituiti dall'API:

- `hostToken` identifica il docente.
- `playerToken` identifica una squadra.

I token sono necessari per leggere lo stato personalizzato e per eseguire azioni
protette. Non c'e un sistema di autenticazione esterno nel gioco: il controllo
di autorizzazione e basato sui token della stanza.

## Note Di Deployment

Il progetto e predisposto per Cloudflare Workers tramite vinext.

- `worker/index.ts` delega le richieste al router vinext e gestisce
  l'endpoint di ottimizzazione immagini `/_vinext/image`.
- `.openai/hosting.json` dichiara il binding D1 `DB`.
- `vite.config.ts` configura il binding locale per D1 e l'eventuale R2.

In ambienti Cloudflare reali, assicurarsi che la binding `DB` punti al database
D1 corretto.

## Sviluppo

Quando si modifica il gioco, i punti piu importanti sono:

- `lib/game.ts` per cambiare regole, bilanciamento, prodotti, prezzi, quartieri,
  eventi o ricerche.
- `app/api/game/route.ts` per cambiare flussi server, validazioni e shape delle
  risposte API.
- `app/game-client.tsx` per cambiare UX, componenti e gestione dello stato.
- `db/schema.ts` per cambiare persistenza e struttura dati.

Se cambi `db/schema.ts`, genera una migrazione con `npm run db:generate` e
verifica che `ensureGameSchema()` resti coerente con lo schema.

## Comandi Utili

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run db:generate
```

## Stato Del README

Questo README descrive il progetto applicativo presente nel repository, non lo
starter vinext di partenza. Se vengono aggiunte nuove modalita di gioco,
endpoint o tabelle, aggiornarlo insieme al codice.
