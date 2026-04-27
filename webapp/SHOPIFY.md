# Shopify Notes

La documentazione Shopify presente in versioni precedenti del progetto non descrive piu' il flusso applicativo principale della webapp.

## Stato attuale

Nel codice attuale:

- non esistono endpoint attivi dedicati a webhook/polling Shopify
- `.env.example` non prevede credenziali Shopify
- il flusso operativo recente per le iscrizioni usa `enrollments`, enrollment API esterna e webhook dedicato

Restano alcuni residui storici:

- colonna `subscribers.shopify_order_id`
- schema di validazione `shopifyWebhookOrderSchema`
- riferimenti in migration e test legacy

## Indicazione pratica

Per l'uso corrente del progetto, considerare Shopify come integrazione legacy/non attiva.

La documentazione da seguire e' invece:

- [README.md](./README.md)
- [WEBHOOK.md](./WEBHOOK.md)

Se in futuro verra' ripristinata una vera integrazione Shopify, questa pagina dovra' essere riscritta a partire dal codice reale.
