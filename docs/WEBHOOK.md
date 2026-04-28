# Enrollment Sync And Webhook

La webapp supporta due meccanismi complementari per importare iscrizioni:

- sync pull verso un'API esterna
- webhook push verso `POST /api/v1/webhooks/enrollments`

Entrambi i flussi convergono in `src/lib/services/enrollments.ts` e aggiornano:

- `enrollments`
- `subscribers`
- `enrollment_sync_log`

## Configurazione

La configurazione non usa variabili ambiente dedicate. Viene salvata nella tabella `settings`:

- `enrollment_api_url`
- `enrollment_api_key`
- `webhook_enrollment_secret`

Dal pannello `/settings` e' possibile:

- salvare URL e API key del sistema esterno
- testare la connessione con `POST /api/v1/settings/enrollment-api/test`
- leggere o rigenerare il secret webhook

## Sync pull

Endpoint admin:

```text
POST /api/v1/courses/sync
```

Comportamento:

- richiede sessione admin
- legge `enrollment_api_url` e `enrollment_api_key` da `settings`
- chiama `GET {apiUrl}/api/v1/enrollments?status=COMPLETED&page=N&limit=100`
- importa/upserta le iscrizioni nel DB locale
- registra l'esito in `enrollment_sync_log` con `triggered_by = 'manual'`

L'endpoint di test connessione usa lo stesso backend, ma interroga solo una pagina minima per verificare raggiungibilita' e autenticazione.

## Webhook push

Endpoint:

```text
POST /api/v1/webhooks/enrollments
```

Header richiesti:

| Header             | Valore                       |
| ------------------ | ---------------------------- |
| `Content-Type`     | `application/json`           |
| `X-Webhook-Secret` | secret generato dalla webapp |

Il secret viene confrontato con `timingSafeEqual`.

Se il secret non e' stato ancora generato, il server restituisce `401`.

## Payload accettato

Il payload atteso e' allineato allo schema Zod definito direttamente nell'endpoint webhook.

Campi principali:

```json
{
	"id": "enr_123",
	"orderId": "ord_456",
	"orderName": "#1042",
	"lineItemId": "line_789",
	"productId": "prod_001",
	"productTitle": "Corso Primo Soccorso",
	"variantTitle": "Edizione Giugno 2026",
	"quantity": 2,
	"customerEmail": "buyer@example.com",
	"customerDisplayName": "Mario Rossi",
	"participants": [
		{
			"index": 1,
			"firstName": "Mario",
			"lastName": "Rossi",
			"email": "mario@example.com",
			"phone": "+39 333 1234567",
			"fiscalCode": "RSSMRA80A01H501Z"
		}
	],
	"preferredDate": "2026-06-15",
	"notes": "Preferenza mattino",
	"submittedAt": "2026-04-01T10:00:00Z",
	"status": "COMPLETED",
	"createdAt": "2026-04-01T09:58:00Z",
	"updatedAt": "2026-04-01T10:00:00Z"
}
```

Vincoli rilevanti:

- `status` ammesso: `SUBMITTED` oppure `COMPLETED`
- `PENDING` viene ignorato dalla logica applicativa
- `participants[]` puo' essere vuoto, ma se presente ogni elemento deve rispettare lo schema dell'endpoint

## Regole applicative

- l'iscrizione viene identificata da `external_id`
- una chiamata webhook crea comunque un record in `enrollment_sync_log` con `triggered_by = 'webhook'`
- se l'iscrizione esiste gia', viene aggiornata
- quando `participants[]` e' valorizzato, il servizio puo' associare o creare subscriber separati
- i campi root `firstName`, `lastName`, `phone`, `fiscalCode` sono mantenuti per compatibilita', ma la logica recente privilegia `participants[]`

## Gestione secret

Endpoint admin:

```text
GET  /api/v1/webhooks/enrollments/secret
POST /api/v1/webhooks/enrollments/secret
```

Uso tipico:

1. generare il secret dalla UI o via `POST`
2. configurare il secret sul sistema remoto
3. inviare webhook firmati tramite header `X-Webhook-Secret`
4. ruotare il secret quando necessario

La rotazione invalida immediatamente il valore precedente.

## Risposte attese

- `200`: payload accettato ed elaborato
- `400`: JSON o payload non valido
- `401`: secret assente, errato o webhook non configurato
- `500`: errore interno

In caso di `5xx`, il mittente remoto dovrebbe implementare retry con backoff. In caso di `4xx`, e' piu' corretto fermarsi e correggere configurazione o payload.
