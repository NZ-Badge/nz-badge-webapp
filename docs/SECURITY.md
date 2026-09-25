# Security Notes

Questo documento riassume le misure di sicurezza effettivamente rintracciabili nel codice della webapp. Non e' una dichiarazione di conformita' normativa.

## Autenticazione

### Sessione utenti

- login tramite email/password contro tabella `users`
- sessione salvata in cookie `session`
- firma JWT HS256 con `JWT_SECRET` (obbligatorio, almeno 32 caratteri: altrimenti login e
  verifica sessione falliscono con errore esplicito); `jwtVerify` accetta solo `HS256`
- durata sessione: 8 ore
- cookie `httpOnly`, `sameSite=strict`, `secure` fuori da `dev`
- ruoli ammessi nell'app: `admin`, `staff`, `collaborator`
- ogni richiesta ricarica l'utente dal database e rifiuta account con stato diverso da `active`
- la disattivazione e' un soft delete; invalida anche sessioni gia' emesse al controllo successivo
- login con rate limit in-memory: 5 tentativi per email e 20 per IP ogni 15 minuti (risposta 429)
- login riusciti (`LOGIN`) e falliti (`LOGIN_FAILED`, email mascherata) finiscono in `audit_log`;
  i log applicativi riportano solo l'id utente

Codice rilevante:

- `src/routes/login/+page.server.ts`
- `src/lib/services/auth.ts`

### Device authentication

- bearer token in header `Authorization`
- device id in header `X-Device-ID`
- token salvati come bcrypt hash in `device_registry.token_hash`
- aggiornamento `last_ping` su autenticazione riuscita

Codice rilevante:

- `src/lib/services/auth.ts`
- `src/routes/api/v1/attendance/+server.ts`
- `src/routes/api/v1/attendance/batch/+server.ts`
- `src/routes/api/v1/firmware/check/+server.ts`
- `src/routes/api/v1/firmware/download/[version]/+server.ts`

## Autorizzazione

- `hooks.server.ts` nega per default ogni route del gruppo `(app)` senza sessione valida
  (redirect a `/login`) e applica la allowlist dei Collaboratori alle richieste dati e alle form
  action; il layout mostra la pagina 403 nei rendering completi
- ogni `load` e form action in `(app)` chiama comunque una guardia esplicita di
  `src/lib/services/auth.ts`: `requirePageUser`, `requirePageStaff` o `requirePageAdmin`. Il layout
  non viene eseguito per le action e puo' essere saltato dalle richieste dati, quindi non basta
- nelle API: `locals.verifyUser()` (tutti i ruoli attivi), `locals.verifyStaffOrAdmin()`
  (Amministratori e Operatori) e `locals.verifyAdminOnly()` (solo `admin`). `locals.verifyAdmin()`
  e' un alias deprecato di `verifyStaffOrAdmin`
- impostazioni (`/api/v1/settings`, test enrollment API) e secret webhook sono solo `admin`;
  `GET /api/v1/settings` e la pagina impostazioni non restituiscono mai API key, secret webhook o
  chiavi MIFARE in chiaro (solo flag `has_key`/`has_secret`/`hasKeys`); il secret webhook si legge
  su richiesta con `GET /api/v1/webhooks/enrollments/secret`
- i dati staff applicano anche controlli “proprio utente oppure Amministratore/Operatore” lato
  server; nascondere i comandi nella UI non e' considerato un controllo sufficiente
- i device non possono accedere agli endpoint admin e viceversa

## Header e CSP

`src/hooks.server.ts` applica:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- rimozione di `X-Powered-By` e `Server`

Fuori da `dev`, vengono aggiunti anche gli header generati da `generateSecurityHeaders()` e un nonce CSP per gli script inline trasformati nel rendering.

## Validazione input

Le API usano soprattutto:

- schemi Zod in `src/lib/utils/validation.ts`
- helper di risposta in `src/lib/utils/api.ts`
- utility di sanitizzazione in `src/lib/utils/security.ts`

Esempi:

- payload presenze singole e batch
- create/update subscriber
- workflow card write/validate
- payload webhook iscrizioni
- parametri query export/listing

## Audit log

La tabella `audit_log` viene usata per tracciare varie operazioni sensibili, tra cui:

- creazione/modifica/cancellazione subscriber
- flussi card write/erase
- modifica dell'orario delle presenze corsisti
- inserimenti e modifiche delle strisciate staff
- soft delete degli account
- operazioni amministrative specifiche

La copertura non e' uniforme su ogni endpoint del progetto, quindi va considerata parziale e orientata ai flussi piu' critici.

## Rate limiting

Il codice contiene rate limiter in-memory per:

- autenticazione device
- login admin (per IP e per email)
- endpoint presenze singole
- endpoint presenze batch

Conseguenze operative:

- le soglie valgono per processo, non globalmente su piu' istanze
- un riavvio del processo azzera lo stato del limiter

## Secret e configurazioni sensibili

- `JWT_SECRET` arriva da environment
- il secret del webhook iscrizioni e' salvato nella tabella `settings`
- URL e API key dell'enrollment API sono salvati nella tabella `settings`

Questo consente rotazione via UI, ma implica che la protezione del database e dei backup e' parte della superficie di sicurezza.

## Firmware OTA

- solo device autenticati possono interrogare check/download firmware
- il download serve esclusivamente release marcate attive
- i file vengono letti dal filesystem locale sotto `localfiles/`

## Limiti da conoscere

- il documento non rivendica conformita' HIPAA/GDPR o certificazioni analoghe
- le policy password lato API utenti sono minime: lunghezza 8 caratteri
- il rate limiting non e' centralizzato
- la sicurezza operativa dipende anche da reverse proxy, TLS, backup e gestione segreti esterni al repository
