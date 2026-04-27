# Webhook Iscrizioni

Documentazione per l'integrazione del webhook che permette al server remoto di inviare le iscrizioni in push alla webapp, invece di attendere la sincronizzazione manuale o schedulata.

## Panoramica

Il webhook segue lo stesso comportamento della sincronizzazione REST:

- **Upsert**: se l'iscrizione (`id`) è già presente nel database, il record viene **aggiornato** con i nuovi dati (stato, note, date, ecc.).
- **Multi-partecipanti**: quando `participants[]` è presente, viene creato un subscriber **per ogni partecipante**, usando l'email specifica di ciascun partecipante (non più l'email dell'acquirente).
- **Log**: ogni chiamata webhook crea un record in `enrollment_sync_log` con `triggered_by = 'webhook'`.

## Configurazione

### 1. Generare il secret

Dal pannello Admin → **Impostazioni**, nella sezione **Webhook Iscrizioni**, clicca **Genera secret**.

Il secret è una stringa esadecimale a 64 caratteri (32 byte random). Copialo e configuralo sul server remoto.

> **Importante:** il secret è visibile una volta sola dopo la generazione. Conservalo in un posto sicuro. Se lo perdi, rigeneralo (il vecchio smette di funzionare immediatamente).

### 2. Configurare il server remoto

Il server remoto deve inviare una richiesta `POST` all'endpoint webhook ad ogni nuova iscrizione, passando il secret nell'header `X-Webhook-Secret`.

## Endpoint

```
POST /api/v1/webhooks/enrollments
```

### Headers richiesti

| Header | Valore |
|--------|--------|
| `Content-Type` | `application/json` |
| `X-Webhook-Secret` | `<secret generato in Admin>` |

### Payload

Il corpo della richiesta è un oggetto JSON con i dati dell'iscrizione:

```json
{
  "id": "string",
  "orderId": "string",
  "orderName": "string | null",
  "lineItemId": "string",
  "productId": "string | null",
  "productTitle": "string | null",
  "variantTitle": "string | null",
  "quantity": 2,
  "customerEmail": "acquirente@esempio.it",
  "customerDisplayName": "string | null",
  "participants": [
    {
      "index": 1,
      "firstName": "Mario",
      "lastName": "Rossi",
      "email": "mario.rossi@esempio.it",
      "phone": "+39 333 1234567 | null",
      "fiscalCode": "RSSMRA80A01H501Z | null"
    },
    {
      "index": 2,
      "firstName": "Laura",
      "lastName": "Bianchi",
      "email": "laura.bianchi@esempio.it",
      "phone": null,
      "fiscalCode": null
    }
  ],
  "firstName": "string | null (deprecated)",
  "lastName": "string | null (deprecated)",
  "phone": "string | null (deprecated)",
  "fiscalCode": "string | null (deprecated)",
  "preferredDate": "2025-06-15 | null",
  "notes": "string | null",
  "submittedAt": "2025-04-01T10:00:00Z | null",
  "status": "SUBMITTED | COMPLETED",
  "createdAt": "2025-04-01T10:00:00Z",
  "updatedAt": "2025-04-01T10:00:00Z"
}
```

#### Campi obbligatori

- `id`, `orderId`, `lineItemId`, `customerEmail`, `status`, `createdAt`, `updatedAt`
- Ogni partecipante in `participants[]` deve avere: `index`, `firstName`, `lastName`, `email`

#### Note sui partecipanti

- **`participants[]`**: array che contiene i dati di ogni partecipante all'iscrizione. Per ogni partecipante viene creato un subscriber separato con la propria email.
- **`customerEmail`**: email dell'acquirente (chi ha fatto l'ordine), usata solo come riferimento. I subscriber vengono creati usando l'email del singolo partecipante.
- **Campi deprecated**: `firstName`, `lastName`, `phone`, `fiscalCode` a livello root sono deprecati — usare i corrispondenti campi dentro `participants[]`.

Il formato è identico agli oggetti restituiti dall'endpoint REST `/api/v1/enrollments` del server remoto, quindi lo stesso codice di serializzazione può essere riusato.

### Risposta

**200 OK** — iscrizione elaborata (o già esistente):

```json
{
  "success": true,
  "data": {
    "enrollmentsFound": 1,
    "enrollmentsCreated": 2,
    "subscribersCreated": 2,
    "errors": 0
  }
}
```

- `enrollmentsCreated: N` → N enrollment inseriti (uno per partecipante)
- `enrollmentsCreated: 0` → iscrizione già presente, aggiornata
- `subscribersCreated: N` → N subscriber creati automaticamente dalle email dei partecipanti

**401 Unauthorized** — secret mancante, non valido, o webhook non ancora configurato.

**400 Bad Request** — payload JSON non valido o campi mancanti/errati.

**500 Internal Server Error** — errore interno, ritenta con backoff esponenziale.

## Esempio di chiamata

```bash
curl -X POST https://tuodominio.example.com/api/v1/webhooks/enrollments \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: a3f8c2...il-tuo-secret" \
  -d '{
    "id": "enr_123abc",
    "orderId": "ord_456def",
    "orderName": "#1042",
    "lineItemId": "li_789ghi",
    "productId": "prod_001",
    "productTitle": "Corso Primo Soccorso",
    "variantTitle": "Edizione Giugno 2025",
    "quantity": 2,
    "customerEmail": "mario.rossi@esempio.it",
    "customerDisplayName": "Mario Rossi",
    "participants": [
      {
        "index": 1,
        "firstName": "Mario",
        "lastName": "Rossi",
        "email": "mario.rossi@esempio.it",
        "phone": "+39 333 1234567",
        "fiscalCode": "RSSMRA80A01H501Z"
      },
      {
        "index": 2,
        "firstName": "Laura",
        "lastName": "Bianchi",
        "email": "laura.bianchi@esempio.it",
        "phone": null,
        "fiscalCode": null
      }
    ],
    "preferredDate": "2025-06-15",
    "notes": "Preferisco il mattino",
    "submittedAt": "2025-04-01T10:00:00Z",
    "status": "COMPLETED",
    "createdAt": "2025-04-01T09:58:00Z",
    "updatedAt": "2025-04-01T10:00:00Z"
  }'
```

## Sicurezza

- Il secret viene confrontato con `timingSafeEqual` (nessuna vulnerabilità timing-attack).
- Il secret è memorizzato nella tabella `settings` del database, non in variabili d'ambiente, per permettere la rotazione senza riavvio del server.
- Se non è stato ancora generato nessun secret, tutte le chiamate ricevono `401`.

## Rotazione del secret

1. In Admin → Impostazioni → Webhook Iscrizioni, clicca **Rigenera secret**.
2. Copia il nuovo secret.
3. Aggiorna la configurazione del server remoto.
4. Il vecchio secret è immediatamente invalidato.

> Coordina la rotazione con il team che gestisce il server remoto per evitare interruzioni.

## Gestione degli errori sul server remoto

Si consiglia di implementare sul server remoto:

- **Retry con backoff esponenziale** in caso di risposta `5xx` (es. 3 tentativi: 10s, 30s, 90s).
- **Nessun retry** in caso di risposta `4xx` (secret errato o payload non valido — richiede intervento manuale).
- **Idempotenza garantita**: in caso di dubbio, reinviare la stessa iscrizione è sicuro — se `id` esiste già, il record viene aggiornato con i dati più recenti.

## API di gestione secret (Admin)

Oltre all'interfaccia grafica, il secret può essere gestito via API (richiede sessione admin):

```bash
# Leggere il secret corrente
GET /api/v1/webhooks/enrollments/secret

# Generare / rigenerare il secret
POST /api/v1/webhooks/enrollments/secret
```

Entrambi gli endpoint richiedono il cookie di sessione admin (`session`).
