# Device API

Questa pagina descrive il contratto HTTP implementato dal backend per i reader e per i flussi hardware orchestrati dalla UI. Gli esempi mostrano la struttura JSON effettivamente restituita dal codice.

## Autenticazione

### Endpoint reader

I reader devono inviare entrambi gli header:

```http
Authorization: Bearer <token>
X-Device-ID: <device-id>
```

Il backend cerca `X-Device-ID` in `device_registry`, verifica che il device sia attivo e confronta il bearer token con `device_registry.token_hash` tramite bcrypt. Una verifica riuscita aggiorna `last_ping` in modo asincrono.

Gli endpoint reader restituiscono `401` se gli header mancano, il device non esiste o e' disabilitato, oppure il token non e' valido.

### Flussi hardware assistiti dalla UI

Gli endpoint di scrittura, cancellazione, lookup e pairing card richiedono il cookie di sessione dell'applicazione, non il bearer token del device. Nel codice attuale `verifyAdmin()` accetta utenti con ruolo `admin` o `staff`; i singoli endpoint card elencati sotto non applicano un ulteriore `requireAdmin()`.

## Formato degli errori HTTP

Gli errori generati dagli helper API hanno questa forma:

```json
{
  "success": false,
  "error": "Descrizione errore"
}
```

Codici rilevanti per i reader:

| HTTP  | Significato                                                 |
| ----- | ----------------------------------------------------------- |
| `400` | JSON o payload non valido                                   |
| `401` | autenticazione device fallita                               |
| `404` | risorsa non trovata, per esempio firmware non disponibile   |
| `429` | rate limit dell'endpoint superato; include `Retry-After: 1` |
| `500` | errore interno                                              |
| `503` | database non raggiungibile negli health check               |

Un evento di presenza rifiutato per una regola applicativa non produce un errore HTTP: viene descritto nella normale risposta attendance tramite `rejected` e `rejection_reason`.

## Probe e health

Entrambi gli endpoint eseguono `SELECT 1` sul database e non richiedono autenticazione.

### `GET /status`

Risposta `200`:

```json
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2026-08-25T13:09:57.000Z"
}
```

In caso di database non raggiungibile restituisce `503`, `status: "unhealthy"` e `database: "disconnected"`.

### `GET /api/v1/health`

Risposta `200`:

```json
{
  "status": "ok",
  "db": "connected",
  "timestamp": "2026-08-25T13:09:57.000Z"
}
```

In caso di database non raggiungibile restituisce `503`, `status: "error"` e `db: "unreachable"`.

## Attendance ingest

Gli endpoint attendance autenticano il device, validano l'intero payload e applicano un rate limit in-memory separato per endpoint e `deviceId`: sono consentite fino a 10 richieste in una finestra mobile di un secondo; dalla undicesima viene restituito `429`.

### Formato evento

Ogni elemento di `events` usa questo contratto:

```json
{
  "uid": "FE:B2:25:07",
  "uid_raw": "FEB22507",
  "timestamp": "2026-08-25T13:09:57.000Z",
  "type": "entry",
  "device_time_raw": "2026-08-25T15:09:57.000+02:00"
}
```

| Campo             | Obbligatorio | Regola                                                                                                                 |
| ----------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `uid`             | si           | 4-7 byte esadecimali maiuscoli separati da `:`                                                                         |
| `uid_raw`         | no           | 8-14 caratteri esadecimali maiuscoli senza separatori                                                                  |
| `timestamp`       | si           | data/ora ISO 8601 validata da Zod                                                                                      |
| `type`            | si           | `entry` oppure `exit`; rimane nel payload raw, ma il server ricalcola il tipo effettivo dalla cronologia               |
| `device_time_raw` | no           | data/ora ISO 8601 con offset; se presente viene usata al posto di `timestamp` per tutte le regole e per il salvataggio |

Il tipo effettivo restituito in `actions[].type` e salvato nel database e' determinato dal server alternando `entry`/`exit`. Se `reset_entry_type_daily` e' abilitato, la prima strisciata di una nuova giornata riparte da `entry`.

### Validazione applicativa di una strisciata

Le condizioni di rifiuto sono valutate in quest'ordine:

| `rejection_reason`         | Condizione                                                            |
| -------------------------- | --------------------------------------------------------------------- |
| `unknown_card`             | UID non registrato oppure card con stato diverso da `active`          |
| `timestamp_out_of_range`   | timestamp effettivo distante piu' di 30 giorni dall'ora del server    |
| `course_date_out_of_range` | nessuna iscrizione dell'intestatario include la data della strisciata |

Per il controllo corso:

- la data civile viene calcolata nel fuso `Europe/Rome`;
- `startDate` ed `endDate` sono inclusivi: `startDate <= data <= endDate`;
- basta una qualsiasi iscrizione dello stesso subscriber con entrambe le date compatibili;
- lo stato dell'iscrizione non viene filtrato;
- una card senza subscriber o un'iscrizione senza entrambe le date non supera il controllo;
- `subscriber.status` e `card.expirationDate` non partecipano attualmente a questa validazione.

Prima di classificare come sconosciuto un UID nell'endpoint non-batch, il servizio tenta l'eventuale claim di una sessione NFC in-memory pendente. Il percorso batch non esegue questo tentativo.

### `accepted`, `rejected` e `ignored`

| Esito              | Contatori                     | Database                       | Azione device                    |
| ------------------ | ----------------------------- | ------------------------------ | -------------------------------- |
| accettato          | `accepted + 1`                | inserito con `validated: true` | `confirm`                        |
| rifiutato          | `rejected + 1`                | non inserito                   | `unknown` con `rejection_reason` |
| troppo ravvicinato | nessun contatore incrementato | non inserito                   | `ignored` con `ignored_reason`   |

Una strisciata altrimenti valida viene ignorata se per lo stesso UID esiste una presenza entro `min_swipe_interval_minutes`. Il valore predefinito del servizio e' 15 minuti. L'azione restituita contiene, per esempio, `ignored_reason: "min_interval_15min"`.

### Formato delle azioni

Conferma:

```json
{
  "uid": "FE:B2:25:07",
  "action": "confirm",
  "user_name": "Mario Rossi",
  "type": "entry"
}
```

Rifiuto:

```json
{
  "uid": "FE:B2:25:07",
  "action": "unknown",
  "type": "entry",
  "rejection_reason": "course_date_out_of_range"
}
```

Ignorata per intervallo minimo:

```json
{
  "uid": "FE:B2:25:07",
  "action": "ignored",
  "user_name": "Mario Rossi",
  "type": "exit",
  "ignored_reason": "min_interval_15min"
}
```

`user_name`, `rejection_reason` e `ignored_reason` sono campi condizionali. Il firmware deve quindi considerarli opzionali. `rejection_reason` e' presente sulle azioni prodotte da un rifiuto applicativo; non e' presente sulle risposte dei server precedenti a questa estensione.

### `POST /api/v1/attendance`

Invia uno o piu' eventi online. `events` deve contenere almeno un elemento e non ha un massimo imposto dallo schema. `queue_status` e' opzionale.

Richiesta:

```json
{
  "events": [
    {
      "uid": "FE:B2:25:07",
      "uid_raw": "FEB22507",
      "timestamp": "2026-08-25T13:09:57.000Z",
      "type": "entry",
      "device_time_raw": "2026-08-25T15:09:57.000+02:00"
    }
  ],
  "queue_status": {
    "pending": 0,
    "storage_free_percent": 87
  }
}
```

Una richiesta processata restituisce sempre `200`, anche quando uno o piu' eventi sono rifiutati o ignorati. La risposta usa l'envelope `success/data`:

```json
{
  "success": true,
  "data": {
    "accepted": 0,
    "rejected": 1,
    "server_time": "2026-08-25T15:09:58.171+02:00",
    "actions": [
      {
        "uid": "FE:B2:25:07",
        "action": "unknown",
        "type": "entry",
        "rejection_reason": "course_date_out_of_range"
      }
    ]
  }
}
```

L'endpoint singolo non restituisce `results`: il motivo del rifiuto va letto da `data.actions[].rejection_reason`.

### `POST /api/v1/attendance/batch`

Invia eventi offline o accodati. Il payload richiede:

- `events`: da 1 a 10 elementi;
- `batch_info.total_queued`: intero maggiore o uguale a zero;
- `batch_info.batch_sequence`: intero maggiore o uguale a uno;
- `queue_status.pending`: intero maggiore o uguale a zero;
- `queue_status.storage_free_percent`: intero tra 0 e 100.

Richiesta:

```json
{
  "events": [
    {
      "uid": "FE:B2:25:07",
      "uid_raw": "FEB22507",
      "timestamp": "2026-08-25T13:09:57.000Z",
      "type": "entry",
      "device_time_raw": "2026-08-25T15:09:57.000+02:00"
    }
  ],
  "batch_info": {
    "total_queued": 1,
    "batch_sequence": 1
  },
  "queue_status": {
    "pending": 0,
    "storage_free_percent": 87
  }
}
```

Una richiesta processata restituisce sempre `207 Multi-Status`. A differenza dell'endpoint non-batch, i campi sono al livello principale e non dentro `data`:

```json
{
  "success": true,
  "accepted": 0,
  "rejected": 1,
  "server_time": "2026-08-25T15:09:58.171+02:00",
  "results": [
    {
      "index": 0,
      "status": 400,
      "reason": "course_date_out_of_range"
    }
  ],
  "actions": [
    {
      "uid": "FE:B2:25:07",
      "action": "unknown",
      "type": "entry",
      "rejection_reason": "course_date_out_of_range"
    }
  ]
}
```

`results` contiene solo gli eventi rifiutati. `index` e' l'indice zero-based dell'evento nell'array della richiesta. Il motivo resta disponibile anche nel campo storico `results[].reason`; `actions[].rejection_reason` permette al firmware di trattare allo stesso modo le azioni singole e batch.

Gli eventi batch accettati vengono salvati con `offline_queued: true`. Il controllo dell'intervallo minimo considera sia gli eventi gia' nel database sia quelli precedenti nello stesso batch.

Per le indicazioni di integrazione firmware vedere [FIRMWARE_UPDATES.md](../FIRMWARE_UPDATES.md).

## OTA firmware reader

### `GET /api/v1/firmware/check?version=X.Y.Z`

Richiede autenticazione device. Se `version` manca restituisce `400`. La versione ricevuta viene salvata in modo asincrono in `device_registry.firmware_version`.

Quando esiste una release attiva `reader-station` con versione maggiore:

```json
{
  "update_available": true,
  "version": "1.2.3",
  "url": "/api/v1/firmware/download/1.2.3",
  "sha256": "..."
}
```

Quando non esiste un aggiornamento:

```json
{
  "update_available": false
}
```

Il confronto implementato usa le tre componenti numeriche `MAJOR.MINOR.PATCH`.

### `GET /api/v1/firmware/download/:version`

Richiede autenticazione device. Cerca una release con la versione richiesta e `is_active = true`, legge `file_path` sotto `localfiles/` e restituisce:

- `200` con `Content-Type: application/octet-stream` e `Cache-Control: no-store`;
- `404` se la release non esiste o non e' attiva;
- `500` se il record esiste ma il file non e' presente sul filesystem.

## Endpoint card e hardware per la UI

Questi endpoint richiedono il cookie di sessione applicativo e sono usati dalla UI insieme a WebSerial:

| Endpoint                                 | Input principale                               | Uso                                                  |
| ---------------------------------------- | ---------------------------------------------- | ---------------------------------------------------- |
| `POST /api/v1/card/write`                | `subscriber_id`                                | apre una sessione temporanea di scrittura card       |
| `POST /api/v1/card/validate`             | `session_token`, `uid`, `allow_reuse_deleted?` | conferma la scrittura riuscita con l'UID letto       |
| `POST /api/v1/card/erase`                | `card_id`                                      | apre una sessione di cancellazione fisica            |
| `POST /api/v1/card/[id]/erase/confirm`   | `session_token`                                | conferma la cancellazione fisica                     |
| `GET /api/v1/card/lookup?uid=...`        | query `uid`                                    | ricerca card e subscriber per UID                    |
| `POST /api/v1/subscribers/[id]/pair-nfc` | `uid`                                          | registra direttamente un UID come card di tipo `nfc` |

Il writer non e' integrato come client API standalone: il browser autenticato orchestra UI, WebSerial e backend HTTP.

## Gestione device registry

La registrazione avviene dal pannello admin `/devices` e accetta `device_type` uguale a `reader` o `writer`. Il record contiene:

- `device_id`;
- `device_type`;
- `location` opzionale;
- `token_hash` bcrypt;
- `active`;
- `last_ping` e `firmware_version`, aggiornati dai flussi device.

Il token in chiaro viene generato alla creazione e mostrato una sola volta; nel database viene conservato soltanto l'hash.
