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

Accesso tramite login con cookie di sessione JWT.

I Collaboratori vedono soltanto Panoramica, Ingressi collaboratori e I miei ingressi. Gli
Operatori possono consultare lo Staff, gestire card e strisciate, ma la creazione, modifica e
disattivazione degli account resta riservata agli Amministratori.

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

- Node.js 20+
- npm 10+
- MySQL 8+ raggiungibile via `DATABASE_URL`

## Configurazione

Partire da `.env.example`:

```bash
cp .env.example .env
```

### Variabili ambiente

| Variabile             | Obbligatoria | Uso                                                                        |
| --------------------- | ------------ | -------------------------------------------------------------------------- |
| `DATABASE_URL`        | si           | Connessione MySQL usata da app, Drizzle e script                           |
| `JWT_SECRET`          | si           | Firma/verifica cookie di sessione admin                                    |
| `PRIMARY_APP_ORIGIN`  | no           | Origin canonica browser, usata per redirect host legacy                    |
| `LEGACY_APP_HOSTS`    | no           | Lista host legacy separati da virgola da reindirizzare all'origin canonica |
| `BODY_SIZE_LIMIT`     | no           | Limite body upload; utile per firmware `.bin`                              |
| `SMTP_HOST`           | no           | Host SMTP per il job riepilogo settimanale presenze                        |
| `SMTP_PORT`           | no           | Porta SMTP, default `587`                                                  |
| `SMTP_SECURE`         | no           | Usa TLS diretto SMTP, tipicamente `true` con porta `465`                   |
| `SMTP_USER`           | no           | Utente SMTP                                                                |
| `SMTP_PASS`           | no           | Password SMTP                                                              |
| `MAIL_FROM`           | no           | Mittente delle email automatiche                                           |
| `SEED_ADMIN_EMAIL`    | no           | Richiesta da `npm run db:seed`                                             |
| `SEED_ADMIN_PASSWORD` | no           | Richiesta da `npm run db:seed`                                             |
| `SEED_ADMIN_NAME`     | no           | Nome admin seed, default `Administrator`                                   |

Note:

- configurazione enrollment API e secret webhook non stanno in `.env`: vengono salvati nella tabella `settings`
- senza `JWT_SECRET` il login admin e la validazione sessione non funzionano
- con `PRIMARY_APP_ORIGIN` e `LEGACY_APP_HOSTS` puoi mantenere attivi host secondari, ma forzare il browser a usare il dominio principale

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

- `/status` e `/api/v1/health` eseguono health check con ping DB
- le protezioni HTTP (header/CSP) vengono applicate in `src/hooks.server.ts`
- i rate limiter presenti lato API sono in-memory, quindi valgono per singola istanza di processo
- questo repository non include oggi una configurazione `ddev`; la documentazione operativa e' pensata per esecuzione Node/MySQL standard
