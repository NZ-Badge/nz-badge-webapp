# AGENTS.md

## Ambito del progetto

Questo repository contiene la webapp di `nz_badge`: pannello amministrativo, backend HTTP per
`reader-station` e gestione delle card tramite browser/WebSerial. Lo stack e' SvelteKit 2,
Svelte 5, TypeScript strict, Tailwind CSS 4, Drizzle ORM e MySQL.

Il codice eseguibile e i comandi npm si trovano in `webapp/`; documentazione, configurazione
DDEV e file operativi sono alla radice del repository.

## Dove cercare

- `README.md`: panoramica, setup, comandi e flussi principali.
- `webapp/src/routes/(app)`: pagine protette e relative server actions.
- `webapp/src/routes/api/v1`: API per admin, reader e integrazioni.
- `webapp/src/lib/services`: logica di dominio; evitare di duplicarla nelle route.
- `webapp/src/lib/db/schema.ts`: schema Drizzle corrente.
- `webapp/src/lib/db/migrations`: migration SQL versionate.
- `webapp/src/lib/stores/webserial.svelte.ts` e utility `webserial*`: comunicazione col writer.
- `docs/DEVICE-API.md`, `docs/WEBHOOK.md`, `docs/SECURITY.md`: contratti e vincoli da mantenere.

In caso di divergenza, considerare il codice e i test come fonte primaria, poi le migration e
infine la documentazione. Aggiornare la documentazione quando cambia un comportamento pubblico.

## Vincoli di dominio

- Le pagine admin usano sessioni JWT via cookie; i reader usano bearer token insieme a
  `X-Device-ID`. Non mescolare i due modelli di autenticazione.
- Il writer non e' un client delle API device: il browser admin orchestra write/erase via
  WebSerial e conferma il risultato al backend.
- La logica presenze decide lato server `entry`/`exit`, deduplica gli swipe e supporta batch
  offline. Conservare compatibilita' con i payload descritti in `docs/DEVICE-API.md`.
- Le regole temporali applicative usano il fuso `Europe/Rome`; non affidarsi implicitamente al
  fuso della macchina o del database.
- Enrollment API, webhook secret, regole presenze e modalita' MIFARE sono configurazioni runtime
  nella tabella `settings`, non variabili `.env`.
- I riferimenti Shopify sono legacy: per nuove funzionalita' usare `enrollments` e
  `enrollment_sync_log`, salvo richiesta esplicita diversa.
- I firmware OTA sono file locali in `localfiles/firmware/reader-station/`; viene servita solo la
  release attiva.

## Convenzioni di modifica

- Seguire i pattern Svelte 5 e SvelteKit gia' presenti; mantenere TypeScript strict e preferire
  gli alias `$lib` ai percorsi relativi profondi.
- Riutilizzare componenti in `src/lib/components/ui` e helper di validazione/risposta esistenti.
- Validare gli input non fidati con Zod e non esporre secret, hash, token o dettagli interni negli
  errori e nei log.
- Per modifiche al database, mantenere sincronizzati `schema.ts` e una nuova migration SQL
  versionata. Non riscrivere migration gia' applicate e non usare `db:push` come sostituto delle
  migration destinate agli altri ambienti.
- Aggiungere o aggiornare test vicino alla logica cambiata. I test effettivi sono in
  `src/**/*.test.ts` e `tests/integration`; `tests/unit` e `tests/e2e` possono essere placeholder.
- Non modificare `.env`, artefatti generati (`build/`, `.svelte-kit/`) o dati in `localfiles/`
  salvo richiesta esplicita.
- Preservare le modifiche gia' presenti nel worktree e limitare il diff allo scopo richiesto.

## Comandi e verifica

Eseguire i comandi da `webapp/`:

```bash
npm run check
npm run lint
npm run test
npm run build
```

Usare la verifica minima proporzionata alla modifica; prima della consegna, per modifiche
applicative, eseguire almeno `npm run check` e i test pertinenti. I test d'integrazione possono
richiedere `DATABASE_URL` e un MySQL disponibile. Per un database vuoto preferire
`npm run db:migrate:run`; il runner non carica automaticamente `.env`.

Se cambiano endpoint, payload, autenticazione, webhook, schema o setup, aggiornare nello stesso
intervento il README o il documento in `docs/` pertinente.
