# webapp

Applicazione SvelteKit che svolge tre ruoli distinti nello stack `nz_badge`:

- pannello applicativo per collaboratori, operatori e amministratori
- backend API per `reader-station`
- supporto operativo alla scrittura e gestione card via browser/WebSerial

Il repository gestisce iscritti, corsi, card RFID/NFC, presenze, dispositivi registrati, rilascio firmware OTA per i reader e sincronizzazione delle iscrizioni da un sistema esterno.

## Funzionalita'

- dashboard con metriche su iscritti, card, presenze e device online
- anagrafica iscritti con dettaglio corso, card associate e anomalie presenza
- gestione card:
  - emissione card RFID con sessione di scrittura e conferma UID
  - pairing NFC diretto
  - disable/enable/erase/restore/delete della card
- raccolta presenze da device con logica `entry`/`exit`, deduplica temporale e supporto batch offline
- amministrazione dispositivi con token bearer hashati in `device_registry`
- upload e attivazione firmware OTA per `reader-station`
- sincronizzazione iscrizioni da API esterna e ricezione webhook push
- gestione staff con ruoli Amministratore, Operatore e Collaboratore
- card RFID e ingressi/uscite dedicati agli utenti di sistema, separati dalle presenze corsisti
- riepilogo ore settimanale, mensile e per intervallo personalizzato
- impostazioni runtime salvate a database:
  - regole presenze
  - modalita' MIFARE
  - configurazione enrollment API
  - secret webhook iscrizioni

## Ruoli applicativi

### 1. Admin UI

Route principali in `src/routes/(app)`:

- `/dashboard`
- `/subscribers`
- `/cards`
- `/attendance`
- `/staff-attendance`
- `/my-attendance`
- `/devices`
- `/firmware`
- `/settings`
- `/admin/users`
- `/admin/maintenance`

Accesso tramite login con cookie di sessione JWT.
La pagina `/cards` elenca le tessere di corsisti, collaboratori, operatori e amministratori,
indica il tipo di intestatario e permette di cercare per nome le tessere non cancellate.

I Collaboratori vedono soltanto Panoramica, Ingressi collaboratori e I miei ingressi. Gli
Operatori possono consultare lo Staff, gestire card e strisciate, ma la creazione, modifica e
disattivazione o riattivazione degli account resta riservata agli Amministratori.

Gli Amministratori possono scaricare da **Amministrazione → Manutenzione** un backup completo
del database in formato `.sql.gz`. Il download include struttura, dati, trigger, routine ed eventi
del database configurato in `DATABASE_URL`; usa `mariadb-dump` o `mysqldump` e comprime il flusso con gzip.
Il server deve avere uno dei due client installato (`mariadb-dump` e' incluso nell'immagine Docker).
Il file contiene dati riservati: conservarlo in modo sicuro. Se il dump fallisce durante il
download, il trasferimento viene interrotto e il file non è valido.

La stessa pagina permette di importare un backup `.sql.gz` fidato del database configurato in
`DATABASE_URL` (massimo 100 MB compressi). L'importazione richiede una conferma esplicita,
verifica l'integrità gzip e il nome del database, poi elimina e ricrea il database prima di
ripristinare struttura e dati. **Tutti i dati attuali vengono sostituiti**. Il client MySQL deve
avere i permessi `DROP DATABASE` e `CREATE DATABASE`. Poiché le operazioni DDL non sono
transazionali, un errore durante il ripristino può lasciare il database incompleto: scaricare
prima un backup recente e usare il client MySQL se l'app non è più accessibile. Impostare `BODY_SIZE_LIMIT=104857600` e un limite equivalente nel
reverse proxy per consentire il caricamento; DDEV è già configurato per 100 MB.

Prima del `DROP DATABASE` l'import salva automaticamente un **dump di sicurezza** del database
attuale (`nz-badge-pre-import-<timestamp>.sql.gz`) nella directory `DB_BACKUP_DIR` (assoluta o
relativa alla directory di lavoro; default `localfiles/backups`, permessi `0700`/`0600`). Se il dump
non riesce, l'import si ferma senza modificare nulla. Vengono conservati solo gli ultimi
`DB_BACKUP_KEEP` dump (default `10`): i più vecchi vengono eliminati dopo ogni nuovo dump. In
produzione montare `DB_BACKUP_DIR` su un volume persistente. Il nome del file è registrato
nell'`audit_log` (azione `DB_IMPORT`).

### 2. Device backend

Endpoint in `src/routes/api/v1/*` usati dai device:

- invio presenze singole e batch
- check/download firmware OTA
- health/probe

Dettagli in [DEVICE-API.md](./docs/DEVICE-API.md).

### 3. Integrazione esterna

Flussi lato sistemi esterni:

- sync manuale verso API iscrizioni
- webhook `POST /api/v1/webhooks/enrollments`
- gestione del secret webhook e test connessione enrollment API dal pannello impostazioni

Dettagli in [WEBHOOK.md](./docs/WEBHOOK.md).

## Stack

- SvelteKit 2
- Svelte 5
- TypeScript
- Tailwind CSS 4
- Drizzle ORM
- MySQL
- Vitest
- Playwright

## Requisiti

- Node.js 22 LTS (`.nvmrc`; `engines` in `package.json` richiede `>=22.12`)
- npm 10+
- MySQL 8+ raggiungibile via `DATABASE_URL`

## Configurazione

Partire da `.env.example`:

```bash
cp .env.example .env
```

### Variabili ambiente

| Variabile             | Obbligatoria | Uso                                                                                          |
| --------------------- | ------------ | -------------------------------------------------------------------------------------------- |
| `DATABASE_URL`        | si           | Connessione MySQL usata da app, Drizzle e script                                             |
| `JWT_SECRET`          | si           | Firma/verifica cookie di sessione admin                                                      |
| `PRIMARY_APP_ORIGIN`  | no           | Origin canonica browser, usata per redirect host legacy                                      |
| `LEGACY_APP_HOSTS`    | no           | Lista host legacy separati da virgola da reindirizzare all'origin canonica                   |
| `BODY_SIZE_LIMIT`     | no           | Limite body upload; utile per firmware `.bin`                                                |
| `SMTP_HOST`           | no           | Host SMTP per il job riepilogo settimanale presenze                                          |
| `SMTP_PORT`           | no           | Porta SMTP, default `587`                                                                    |
| `SMTP_SECURE`         | no           | Usa TLS diretto SMTP, tipicamente `true` con porta `465`                                     |
| `SMTP_USER`           | no           | Utente SMTP                                                                                  |
| `SMTP_PASS`           | no           | Password SMTP                                                                                |
| `MAIL_FROM`           | no           | Mittente delle email automatiche                                                             |
| `SEED_ADMIN_EMAIL`    | no           | Richiesta da `npm run db:seed`                                                               |
| `SEED_ADMIN_PASSWORD` | no           | Richiesta da `npm run db:seed`                                                               |
| `SEED_ADMIN_NAME`     | no           | Nome admin seed, default `Administrator`                                                     |
| `DB_BACKUP_DIR`       | no           | Directory dei dump di sicurezza pre-import, default `localfiles/backups`                     |
| `DB_BACKUP_KEEP`      | no           | Numero di dump di sicurezza pre-import conservati, default `10`                              |
| `LOG_LEVEL`           | no           | Livello minimo dei log JSON (`debug`, `info`, `warn`, `error`), default `info`               |
| `ADDRESS_HEADER`      | no           | adapter-node: header da cui leggere l'IP client dietro proxy (es. `X-Forwarded-For`)         |
| `XFF_DEPTH`           | no           | adapter-node: numero di proxy fidati davanti all'app quando `ADDRESS_HEADER=X-Forwarded-For` |

Note:

- configurazione enrollment API e secret webhook non stanno in `.env`: vengono salvati nella tabella `settings`
- senza `JWT_SECRET` il login admin e la validazione sessione non funzionano
- con `PRIMARY_APP_ORIGIN` e `LEGACY_APP_HOSTS` puoi mantenere attivi host secondari, ma forzare il browser a usare il dominio principale
- IP client (audit log, rate limit del login): l'app usa `event.getClientAddress()` di adapter-node e non legge direttamente `X-Forwarded-For`. Senza `ADDRESS_HEADER` viene usato l'indirizzo della connessione (dietro un proxy, quello del proxy). Dietro un reverse proxy impostare `ADDRESS_HEADER=X-Forwarded-For` e `XFF_DEPTH` pari al numero di proxy fidati (per esempio `1` con un solo ingress): adapter-node prende l'indirizzo in quella posizione contando da destra, quindi un valore falsificato inserito dal client viene ignorato. In alternativa usare un header impostato solo dal proxy (per esempio `ADDRESS_HEADER=X-Real-IP`)
- i log del server sono righe JSON (`level`, `time`, `scope`, `requestId`, `message`) su stdout/stderr; email, token e campi sensibili vengono redatti. Il `requestId` è restituito anche nell'header `X-Request-ID`

## Setup locale

```bash
npm install
cp .env.example .env
```

### Inizializzazione database consigliata

Per un database vuoto, applicare prima le migration SQL versionate:

```bash
npm run db:migrate:run
```

Questo percorso crea anche le righe iniziali in `settings` richieste da presenze, MIFARE ed enrollment API.

Il runner non carica automaticamente `.env`. Se le variabili non sono gia' esportate nella shell:

```bash
set -a; source .env; set +a; npm run db:migrate:run
```

Se `.env` usa l'host DB interno al container, ad esempio `mysql://db:db@db/db`, ma il comando viene lanciato dall'host:

```bash
set -a; source .env; set +a; DATABASE_URL="${DATABASE_URL/@db\//@127.0.0.1:3306/}" npm run db:migrate:run
```

Se serve creare il primo amministratore:

```bash
SEED_ADMIN_EMAIL=admin@example.test \
SEED_ADMIN_PASSWORD='change-me-now' \
SEED_ADMIN_NAME='Admin' \
npm run db:seed
```

Avvio locale:

```bash
npm run dev
```

### Quando usare `db:push`

`npm run db:push` sincronizza lo schema Drizzle corrente sul database. E' utile in sviluppo rapido, ma non sostituisce la documentazione delle migration SQL gia' versionate nel repository.

## Comandi

| Comando                                  | Descrizione                                                    |
| ---------------------------------------- | -------------------------------------------------------------- |
| `npm run dev`                            | Avvia il server di sviluppo                                    |
| `npm run build`                          | Build di produzione                                            |
| `npm run preview`                        | Preview locale della build                                     |
| `npm run check`                          | Type check SvelteKit/Svelte                                    |
| `npm run lint`                           | Prettier check + ESLint                                        |
| `npm run format`                         | Formatta il codice                                             |
| `npm run test`                           | Esegue i test Vitest                                           |
| `npm run test:watch`                     | Vitest in watch                                                |
| `npm run test:e2e`                       | Esegue Playwright                                              |
| `npm run db:push`                        | Sync schema Drizzle verso il DB                                |
| `npm run db:generate`                    | Genera nuove migration Drizzle                                 |
| `npm run db:migrate`                     | Comando Drizzle Kit migrate                                    |
| `npm run db:migrate:run`                 | Esegue le migration SQL presenti in `src/lib/db/migrations`    |
| `npm run db:seed`                        | Crea il primo utente admin                                     |
| `npm run jobs:weekly-attendance-summary` | Invia il riepilogo settimanale presenze, se abilitato e dovuto |

### Job riepilogo settimanale presenze

Il job puo' essere eseguito ogni giorno: invia email solo il sabato, per la settimana lunedi-venerdi appena conclusa, e salta gli iscritti gia' registrati come inviati in `weekly_attendance_summary_log`.

Prima di ogni invio il job riserva la riga dell'iscritto in `weekly_attendance_summary_log` con
stato `pending` (vincolo univoco iscritto/settimana) e la aggiorna a `sent` o `error` dopo il
tentativo: due esecuzioni sovrapposte non inviano due volte lo stesso riepilogo. Le righe in
`error` vengono ritentate alle esecuzioni successive; una riga rimasta `pending` (processo
interrotto durante l'invio) non viene ritentata automaticamente, perché la mail potrebbe essere
già partita: verificarla e, se serve, impostarla a `error` per forzare un nuovo invio.

Esempio crontab:

```cron
0 8 * * * cd /path/to/webapp && set -a && . ./.env && set +a && npm run jobs:weekly-attendance-summary
```

Opzioni utili per test manuali:

```bash
npm run jobs:weekly-attendance-summary -- --dry-run --force --date=2026-05-30
```

## Struttura del progetto

```text
src/
  lib/
    db/
      schema.ts              # schema Drizzle
      migrations/            # migration SQL versionate
    services/
      attendance.ts          # logica presenze e batch offline
      staff-attendance.ts    # presenze utenti, alternanza e riepiloghi ore
      auth.ts                # sessioni admin + token device
      card-writer.ts         # workflow scrittura/erase card
      enrollments.ts         # sync API esterna + webhook
      mifare-keys.ts         # configurazione chiavi/global key mode
    stores/
      webserial.svelte.ts    # stato connessione writer/browser
  routes/
    (app)/                   # dashboard e pagine protette
    api/v1/                  # API admin/device/integrazioni
tests/
  integration/               # test reali presenti oggi
  unit/                      # placeholder
  e2e/                       # placeholder
scripts/
  migrate.ts                 # runner migration SQL
  seed.ts                    # seed primo admin
```

## Modello dati

Tabelle principali definite in `src/lib/db/schema.ts`:

- `users`
- `subscribers`
- `enrollments`
- `enrollment_sync_log`
- `card_rfid`
- `attendance`
- `staff_attendance`
- `device_registry`
- `audit_log`
- `settings`
- `mifare_keys`
- `firmware_releases`

Osservazioni utili:

- `subscribers.shopify_order_id` e alcuni artefatti Shopify sono residui storici
- il flusso attuale per le iscrizioni ruota attorno a `enrollments`, `enrollment_sync_log` e alle chiavi `enrollment_api_*` in `settings`

## Presenze e card

### Reader

I reader autenticati inviano presenze a:

- `POST /api/v1/attendance`
- `POST /api/v1/attendance/batch`

La logica server:

- valida bearer token + `X-Device-ID`
- collega UID e iscritto
- distingue card corsista e card staff
- decide automaticamente `entry` o `exit`
- ignora swipe troppo ravvicinati in base a `min_swipe_interval_minutes`
- puo' creare pairing NFC al volo se esiste una sessione attiva

Le presenze staff sono salvate in `staff_attendance`. Usano card attiva, tolleranza timestamp,
intervallo minimo e alternanza giornaliera, ma non applicano mai le date di un corso. La
cronologia viene calcolata per utente, quindi card RFID, pulsante della dashboard e inserimenti
manuali possono essere combinati. Le presenze corsisti restano nella tabella `attendance` e
continuano a richiedere un'iscrizione valida per la data della strisciata.

Dal pannello amministrativo, data e ora di una presenza corsista possono essere corrette tramite
`PATCH /api/v1/attendance`; un ingresso o un'uscita possono inoltre essere aggiunti tramite
`POST /api/v1/attendance/manual`. Le operazioni richiedono una sessione
Amministratore/Operatore e sono registrate nell'audit log.

La pagina `/today` mostra i corsisti con almeno un'iscrizione le cui date di inizio e fine
comprendono la giornata corrente in `Europe/Rome`. Riunisce le iscrizioni dello stesso corsista
e indica se esiste almeno una timbratura registrata oggi; le iscrizioni senza anagrafica collegata
sono segnalate separatamente. Lo stato dell'iscrizione non filtra l'elenco, come nella validazione
del corso per i reader.

La pagina `/new-students` elenca le iscrizioni con data di inizio in un intervallo Da/A inclusivo,
preimpostato sulla settimana corrente (lunedì–domenica, calendario `Europe/Rome`).
La tabella mostra 25 iscrizioni per pagina, mantenendo l'intervallo selezionato nella paginazione.
`GET /api/v1/new-students/export?from=AAAA-MM-GG&to=AAAA-MM-GG` scarica lo stesso
elenco completo in CSV, con date in formato `gg/mm/aaaa`. Le pagine `/today` e `/new-students`,
incluso l'export dei nuovi corsisti, sono accessibili anche ai Collaboratori.

Le pagine `/attendance` e `/staff-attendance` consentono sia l'inserimento manuale sia
l'esportazione CSV per intervallo di date o persona. Da entrambe le tabelle si può eliminare
un singolo ingresso o una singola uscita dopo conferma; `/attendance` mantiene anche
l'eliminazione multipla. Gli endpoint sono `DELETE /api/v1/attendance` con
`{ "ids": [id] }` (equivalente a `{ "mode": "ids", "ids": [...] }`, massimo 1000 ID) e
`DELETE /api/v1/staff-attendance` con `{ "id": id }`. Solo gli Amministratori possono inoltre
eliminare in blocco le presenze corsisti che corrispondono ai filtri della pagina con
`DELETE /api/v1/attendance` e
`{ "mode": "filters", "filters": { "from": "AAAA-MM-GG", "to": "AAAA-MM-GG", "subscriber": "...", "device": "..." } }`:
serve almeno un filtro (la tabella non viene mai svuotata senza condizioni), le date sono giorni
civili `Europe/Rome` inclusivi e la risposta è `{ "deleted": n }`. Operatori ricevono `403`.
La pagina `/staff-attendance` e il relativo
export sono riservati ad Amministratori e Operatori; i Collaboratori consultano le proprie
presenze da `/my-attendance`. La dashboard mostra le ultime 10 strisciate del Collaboratore;
`/my-attendance` mostra anche la cronologia completa, paginata. Da entrambe le viste il
Collaboratore può eliminare, dopo conferma, soltanto una propria strisciata errata tramite
`DELETE /api/v1/staff-attendance`; il riepilogo delle ore viene ricalcolato.
Gli endpoint di download sono rispettivamente
`GET /api/v1/attendance/export` e `GET /api/v1/staff-attendance/export`.

Nell'interfaccia le date sono visualizzate come `gg/mm/aaaa`, anche nei calendari di
selezione; gli orari usano il formato 24 ore e il fuso `Europe/Rome`. Il formato non
dipende dalla lingua o dal fuso del browser. I campi data si modificano da tastiera
(giorno, mese, anno) oppure dal calendario. I valori inviati nei form e alle API
restano ISO (`yyyy-MM-dd` o `yyyy-MM-ddTHH:mm`).

### Writer

Il writer non parla direttamente con un'API device dedicata: la scrittura avviene dal browser admin tramite WebSerial.

Flusso sintetico:

1. operatore apre `/subscribers/[id]/write-card` oppure `/admin/users/[id]/write-card`
2. UI richiede `POST /api/v1/card/write`
3. il browser parla via seriale con il writer
4. a scrittura conclusa la UI conferma con `POST /api/v1/card/validate`

Per la cancellazione fisica vale un flusso simile via `POST /api/v1/card/erase` e conferma successiva.

## Firmware OTA

Le release vengono caricate dalla pagina `/firmware` e salvate su filesystem locale in:

```text
localfiles/firmware/reader-station/
```

I reader verificano la disponibilita' di update con:

- `GET /api/v1/firmware/check?version=X.Y.Z`
- `GET /api/v1/firmware/download/:version`

Solo la release marcata `is_active = true` viene servita.

## Integrazioni

- [WEBHOOK.md](./docs/WEBHOOK.md): webhook iscrizioni e sync API esterna
- [DEVICE-API.md](./docs/DEVICE-API.md): endpoint per reader, probe e flussi device-related
- [SECURITY.md](./docs/SECURITY.md): note tecniche sulle misure di sicurezza effettivamente implementate
- [SHOPIFY.md](./docs/SHOPIFY.md): stato della documentazione legacy Shopify

## Testing

La configurazione Vitest include `src/**/*.test.ts` e `tests/**/*.test.ts`.

Nel repository oggi sono presenti test in:

- `tests/integration/attendance.test.ts`
- `tests/integration/card.test.ts`
- `tests/integration/subscriber-course-attendance.test.ts`
- `tests/integration/sync.test.ts`

Le directory `tests/unit` e `tests/e2e` esistono ma al momento contengono solo placeholder.

## Note operative

- `/api/v1/health` è l'health check (usato dall'`HEALTHCHECK` del Dockerfile): esegue `SELECT 1` e risponde solo `{ "status": "ok" }` (`200`) o `{ "status": "error" }` (`503`), senza dettagli dell'errore. `/status` resta come alias con la stessa risposta per le probe esistenti
- migration: `0011_enrollments.sql` e `0011_flowery_korvac.sql` condividono il numero `0011`. Sono già applicate negli ambienti esistenti e non vanno rinominate: Drizzle le distingue tramite il `tag` e l'ordine in `meta/_journal.json`, non dal prefisso numerico. Le nuove migration proseguono la numerazione dopo l'ultima presente
- le protezioni HTTP (header/CSP) vengono applicate in `src/hooks.server.ts`
- l'applicazione va eseguita con **una sola replica** (`replicas: 1`): rate limiter, sessioni di scrittura/cancellazione card (`card-writer.ts`), sessioni di pairing NFC (`nfc-pairing.ts`) e cache delle impostazioni sono in memoria di processo. Con piu' repliche una scrittura card o un pairing avviati su un pod fallirebbero se confermati su un altro; per scalare vanno spostati su DB (tabella con TTL) o Redis
- questo repository non include oggi una configurazione `ddev`; la documentazione operativa e' pensata per esecuzione Node/MySQL standard
