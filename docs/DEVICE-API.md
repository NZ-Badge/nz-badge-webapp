# Device API

Questa pagina raccoglie gli endpoint backend usati dai device o dai flussi hardware correlati.

## Autenticazione

### Reader endpoints

I reader usano:

- `Authorization: Bearer <token>`
- `X-Device-ID: <device-id>`

Il token viene verificato contro `device_registry.token_hash`.

### Admin-assisted hardware flows

I flussi di scrittura/cancellazione card via browser richiedono invece sessione admin (`cookie session`) e non un bearer token device.

## Probe e health

| Endpoint             | Uso                            |
| -------------------- | ------------------------------ |
| `GET /status`        | health check con query DB      |
| `GET /api/v1/health` | health check JSON con query DB |

## Attendance ingest

### `POST /api/v1/attendance`

Invia una o piu' letture singole validate dallo schema `attendanceSingleSchema`.

Comportamento server:

- autentica il device
- applica rate limit in-memory
- valida il payload
- processa gli eventi con `processSingleAttendance()`
- restituisce `accepted`, `rejected`, `server_time`, `actions`

### `POST /api/v1/attendance/batch`

Versione batch per eventi offline o accodati.

Comportamento aggiuntivo:

- massimo 10 eventi per richiesta
- risposta `207 Multi-Status`
- supporto a `batch_info` e `queue_status`

## OTA firmware reader

### `GET /api/v1/firmware/check?version=X.Y.Z`

Risposta tipica:

```json
{
	"update_available": true,
	"version": "1.2.3",
	"url": "/api/v1/firmware/download/1.2.3",
	"sha256": "..."
}
```

Regole:

- richiede auth device
- aggiorna `device_registry.firmware_version`
- considera solo release attive con `deviceType = 'reader-station'`

### `GET /api/v1/firmware/download/:version`

- richiede auth device
- serve solo firmware attivo
- legge il file dal filesystem locale (`localfiles/...`)
- restituisce `application/octet-stream`

## Card and hardware-related admin endpoints

Questi endpoint sono usati dalla UI admin insieme a WebSerial:

| Endpoint                                 | Uso                                                  |
| ---------------------------------------- | ---------------------------------------------------- |
| `POST /api/v1/card/write`                | apre sessione di scrittura card per uno subscriber   |
| `POST /api/v1/card/validate`             | conferma scrittura riuscita con UID letto dal writer |
| `POST /api/v1/card/erase`                | apre sessione di erase fisico                        |
| `POST /api/v1/card/[id]/erase/confirm`   | conferma erase fisico                                |
| `GET /api/v1/card/lookup?uid=...`        | ricerca card per UID                                 |
| `POST /api/v1/subscribers/[id]/pair-nfc` | pairing diretto di UID NFC                           |

Nota importante:

- il writer non e' integrato come client API standalone
- il browser admin funge da orchestratore tra UI, WebSerial e backend HTTP

## Device registry management

La registrazione dei device avviene dal pannello admin `/devices` e popola `device_registry` con:

- `device_id`
- `device_type`
- `location`
- `token_hash`
- `active`

Il token in chiaro viene mostrato una sola volta alla creazione.
