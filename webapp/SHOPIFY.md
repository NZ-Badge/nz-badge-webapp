# Integrazione Shopify - RIL Presenze

Questo documento descrive come configurare l'integrazione tra Shopify e il sistema RIL Presenze per la gestione automatica degli iscritti ai corsi.

---

## Panoramica

L'integrazione permette di:
- **Importare automaticamente** gli ordini Shopify come iscritti nel sistema
- **Mappare i prodotti** Shopify ai corsi presenti in RIL Presenze
- **Sincronizzare** via webhook (in tempo reale) o via polling (manuale)

---

## Configurazione Environment Variables

Aggiungi queste variabili nel file `.env` della webapp:

```bash
# Credenziali API Shopify (per polling)
SHOPIFY_SHOP_DOMAIN=tuo-dominio.myshopify.com
SHOPIFY_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SHOPIFY_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SHOPIFY_API_VERSION=2024-01

# Secret per verifica webhook HMAC
SHOPIFY_WEBHOOK_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Ottenere le credenziali:

1. Vai su **Shopify Admin** → **Impostazioni** → **App e canali di vendita**
2. Clicca su **Sviluppa app** → **Crea un'app**
3. Seleziona **Configura permessi ambito**
4. Abilita i permessi:
   - `read_orders` - per leggere gli ordini
   - `read_products` - per leggere i prodotti (opzionale)
5. In **Credenziali API** troverai **API Key** e **API Secret Key**
6. Per il **Webhook Secret**: vai in **Notifiche** → **Webhooks** → crea un webhook e copia il secret generato

---

## Caratteristiche Prodotto Richieste

### Struttura Prodotto

Il prodotto Shopify deve avere questi campi popolati:

| Campo Shopify | Campo RIL Presenze | Obbligatorio | Note |
|---------------|-------------------|--------------|------|
| `product_id` | `shopifyProductId` | ✅ Sì | Usato per la mappatura |
| `variant_id` | `shopifyVariantId` | ⚪ No | Supportato ma opzionale |
| Titolo prodotto | `productName` | ⚪ No | Solo riferimento |
| Email cliente | `email` | ✅ Sì | Identificativo iscritto |
| Nome (`first_name`) | `firstName` | ⚪ No | Default vuoto |
| Cognome (`last_name`) | `lastName` | ⚪ No | Default vuoto |
| Telefono (`phone`) | `phone` | ⚪ No | Opzionale |
| Data ordine (`created_at`) | `purchaseDate` | ⚪ No | Default data attuale |

### Payload Webhook/Order

Il sistema si aspetta questo formato JSON dall'ordine Shopify:

```json
{
  "id": 1234567890,
  "email": "cliente@esempio.com",
  "first_name": "Mario",
  "last_name": "Rossi",
  "phone": "+39 123 456 7890",
  "created_at": "2024-01-15T10:30:00Z",
  "line_items": [
    {
      "product_id": 9876543210,
      "variant_id": 1111111111
    }
  ]
}
```

---

## Mappatura Prodotti-Corsi

### Tabella `shopify_products_map`

La tabella collega i prodotti Shopify ai corsi RIL Presenze:

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| `shopifyProductId` | BIGINT | ID prodotto Shopify (univoco) |
| `shopifyVariantId` | BIGINT | ID variante Shopify (opzionale) |
| `productName` | VARCHAR(255) | Nome descrittivo per riferimento |
| `courseId` | INT | ID corso in RIL Presense (opzionale) |
| `courseName` | VARCHAR(255) | Nome corso (usato se `courseId` non è specificato) |
| `durationDays` | INT | Durata corso in giorni (opzionale) |
| `active` | BOOLEAN | Se il mapping è attivo |

### Come configurare la mappatura

Inserisci i record nella tabella `shopify_products_map`:

```sql
INSERT INTO shopify_products_map (
    shopifyProductId, 
    shopifyVariantId, 
    productName, 
    courseId, 
    courseName, 
    durationDays, 
    active
) VALUES (
    9876543210,           -- ID prodotto Shopify
    1111111111,           -- ID variante (opzionale)
    'Corso di Primo Soccorso',
    1,                    -- ID corso in RIL Presenze (opzionale)
    'Primo Soccorso Base', -- Nome corso
    30,                   -- Durata in giorni
    true
);
```

> **Nota**: Se `courseId` è NULL, viene usato `courseName` come identificativo testuale del corso.

---

## Modalità di Sincronizzazione

### 1. Webhook (Consigliato - Tempo reale)

Configura un webhook in Shopify per inviare gli ordini al sistema:

1. Vai su **Impostazioni** → **Notifiche** → **Webhooks**
2. Clicca su **Crea webhook**
3. Imposta:
   - **Evento**: `Ordine di pagamento creato`
   - **Formato**: `JSON`
   - **URL**: `https://tuo-dominio.com/api/webhooks/shopify`

Il sistema verifica l'HMAC del webhook per garantire l'autenticità.

### 2. Polling (Manuale)

Per sincronizzare ordini manualmente o tramite cron job:

- Chiama l'API interna di sincronizzazione
- Supporta paginazione con cursor
- Filtra per intervallo date (`from` / `to`)

Comportamento:
- Senza parametri: sincronizza dalla data dell'ultima sincronizzazione
- Con `from`/`to`: sincronizza quell'intervallo specifico
- Con `cursor`: processa solo quella pagina

---

## Flusso di Elaborazione Ordine

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Ordine Shopify │────▶│  Verifica HMAC   │────▶│ Check Idempotenza│
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                                           │
                            ┌──────────────────────────────┘
                            ▼
                   ┌─────────────────┐
                   │  Già processato? │──Sì──▶ Log "ignored"
                   └─────────────────┘
                            │ No
                            ▼
                   ┌─────────────────┐
                   │ Cerca mappatura │──No──▶ courseId = NULL
                   │    prodotto     │
                   └─────────────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │  Crea iscritto  │──▶ Tabella `subscribers`
                   │   in database   │
                   └─────────────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │  Log esito      │──▶ Tabella `shopify_sync_log`
                   └─────────────────┘
```

---

## Gestione Errori e Retry

### Tabella `shopify_sync_log`

Ogni operazione viene loggata con:
- `syncType`: `webhook` o `polling`
- `orderId`: ID ordine Shopify
- `outcome`: `success`, `error`, `ignored`
- `errorMsg`: Messaggio di errore (se presente)
- `payloadJson`: Payload completo ricevuto
- `processedAt`: Timestamp

### Idempotenza

Gli ordini già processati con esito `success` vengono ignorati nelle sincronizzazioni successive. Vengono comunque loggati come `ignored` per tracciabilità.

---

## Endpoint API

### Webhook
```
POST /api/webhooks/shopify
Headers:
  X-Shopify-Hmac-SHA256: <hmac>
Body: <raw order JSON>
```

### Polling (richiede autenticazione admin)
```
POST /api/admin/sync/shopify
Body: {
  "from": "2024-01-01T00:00:00Z",  // opzionale
  "to": "2024-01-31T23:59:59Z",    // opzionale
  "cursor": "..."                   // opzionale, per paginazione
}
```

---

## Best Practices

1. **Configura sempre i webhook** per avere la sincronizzazione in tempo reale
2. **Mappa i prodotti prima** di ricevere ordini, per evitare iscritti senza corso associato
3. **Monitora i log** nella tabella `shopify_sync_log` per verificare errori
4. **Usa il polling** solo per sincronizzazioni iniziali o se i webhook falliscono
5. **Verifica l'HMAC** - il sistema lo fa automaticamente, ma assicurati che `SHOPIFY_WEBHOOK_SECRET` sia corretto

---

## Troubleshooting

### Ordini non arrivano
- Verifica che l'URL webhook sia raggiungibile pubblicamente
- Controlla che `SHOPIFY_WEBHOOK_SECRET` corrisponda a quello in Shopify
- Verifica i log in `shopify_sync_log` con outcome `error`

### Iscritti senza corso
- Verifica che `shopifyProductId` nella mappatura corrisponda all'ordine
- Controlla che il mapping sia `active = true`

### Ordini duplicati
- Il sistema ha protezione idempotente - verifica che non ci siano due record `success` per lo stesso `orderId`
