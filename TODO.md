# TODO

## Refactoring e ottimizzazione (review 2026-09-25)

Stato al momento della review: `svelte-check` 0 errori, ESLint 1 errore (import inutilizzato `formatAttendanceMinutes` in `weekly-attendance-summary.ts:8`), test 97/98 (vedi punto 5).

Percorsi relativi a `webapp/src/` salvo diversa indicazione.

**Ordine consigliato:** 1–5 → 9–12 → 17–18 → 19 → resto.

### 🔴 Priorità alta — sicurezza e correttezza

- [x] **1. Form action senza auth.** In `routes/(app)/subscribers/+page.server.ts:146` e `routes/(app)/subscribers/[id]/+page.server.ts:87` le azioni create/update/delete non chiamano `verifyAdmin()`. Il `load` del layout non viene eseguito per le action, quindi una POST anonima a `?/delete` cancella un iscritto.
  - Centralizzare l'auth in `hooks.server.ts` con una mappa route→ruoli che nega tutto per default.
  - Aggiungere comunque un `requireStaff()` esplicito in ogni load e action.
- [x] **2. Segreti visibili allo staff.** `GET /api/v1/settings` restituisce in chiaro `enrollment_api_key`, `webhook_secret` e `mifare_keys`. `verifyAdmin` lascia passare anche lo staff (`lib/services/auth.ts:176`); stesso problema per il PATCH e per `webhooks/enrollments/secret`.
  - Rinominare `verifyAdmin` in `verifyStaffOrAdmin`.
  - Aggiungere un vero `requireAdmin`.
  - Mascherare i segreti nella risposta (es. `hasKey: boolean`).
- [x] **3. Cancellazione massiva senza protezioni.** `DELETE /api/v1/attendance` con `{all:true}` esegue un DELETE senza WHERE; lo staff può farlo, manca l'audit e il filtro `to` usa la mezzanotte UTC.
  - Spostarlo in un service con `z.discriminatedUnion`.
  - Richiedere almeno un filtro, `requireAdmin` e un range di giorni in fuso Roma.
  - Registrarlo con `logAudit`.
- [x] **4. Giorno calcolato nel fuso del server.** `lib/services/attendance.ts:231-276` e `:553` usano `getDate()`/`toDateString()`, quindi l'ora UTC del container: le strisciate tra le 00:00 e le 02:00 ora di Roma finiscono sul giorno sbagliato. Stesso problema in `routes/(app)/courses/+page.server.ts:31`.
  - Usare `formatInTimeZone(x, 'Europe/Rome', 'yyyy-MM-dd')`, come fa già `getCourseDateKey`.
- [x] **5. Test rosso.** Risolto: il test era sbagliato (i collaboratori possono cancellare le proprie strisciate, serve leggere il record prima del controllo).
- [x] **6. Login non protetto.**
  - Aggiungere un rate limit per IP ed email.
  - Non loggare l'email in chiaro (`routes/login/+page.server.ts:52`).
  - Registrare i login con `logAudit`.
  - All'avvio, verificare che `JWT_SECRET` sia presente e di almeno 32 caratteri; passare `algorithms: ['HS256']` a `jwtVerify`.
- [x] **7. bcrypt a ogni richiesta dei dispositivi.** `lib/services/auth.ts:80` usa costo 12 anche se i token sono casuali a 32 byte. Salvare SHA-256/HMAC del token e confrontarlo con `timingSafeEqual`.
- [x] **8. Stato in memoria.** Con più repliche k3s si rompono:
  - il `RateLimiter` e `deviceRequestLog`, duplicato in `attendance` e `attendance/batch`;
  - il `SessionStore` di `card-writer.ts`;
  - le sessioni di `nfc-pairing.ts`.

  Soluzione: documentato `replicas: 1` nel README (una sola replica in produzione). Da rivedere se si scala.

### 🟠 Architettura e duplicazioni

- [x] **9. Service layer.** 37 file di route importano direttamente `$lib/db`.
  - **Service `subscribers`:** oggi l'update è implementato 3 volte con semantiche diverse (la pagina fa hard delete, l'API soft delete).
  - **Service `settings`:** tipizzato con zod, con cache TTL invalidata al PATCH. Oggi il parsing è duplicato in 3 punti e ogni richiesta dei dispositivi rilegge tutto.
  - **Enable/disable card** (`api/v1/card/[id]/enable|disable`): usare `enableCard`/`disableCard` di `card-writer.ts`, in transazione con `SELECT … FOR UPDATE`.
  - **Business logic** di `attendance-anomalies/[enrollmentId]/+page.server.ts`: spostarla in un service.
- [x] **10. Presenze singole e batch duplicate.** `processSingleAttendance` e `processBatchAttendance` sono circa 200 righe quasi identiche ciascuna e hanno già divergito (solo il batch usa una transazione). Estrarre una sola `processAttendanceEvent(event, ctx, tx)`.
- [x] **11. Risposte API incoerenti.** Usare gli helper di `lib/utils/api.ts` ovunque.
  - Le route che usano `json({error})`: `users`, `users/[id]/reactivate`, `staff-attendance/*`, `attendance/manual`, `new-students/export`, `firmware/check`, `admin/maintenance/*`.
  - La traduzione `AuthError`→HTTP è copiata circa 30 volte e risponde sempre 401 anche per FORBIDDEN e RATE_LIMITED. Creare un unico `authErrorResponse(err)` o un wrapper `withAuth()`.
- [x] **12. Utility condivise da estrarre.**
  - `utils/csv.ts` con `toCsv(headers, rows, {sep, bom})` e protezione dalla formula injection (prefisso `'`). Oggi ci sono 3 generatori CSV diversi.
  - In `utils/date.ts`: `romeDayRange`, `addDaysToDateKey`, `dateKeySchema`, `todayKeyRome`. Oggi sono copiati in 6 file.
  - Rimuovere i no-op `nowInRome`, `parseToRomeDate` e `toDatabaseDateTime`.
  - `parsePagination(url, pageSize)` con zod coerce: con `page=abc` l'offset diventa `NaN` e la pagina va in 500.
- [x] **13. Transazioni mancanti.**
  - Sync e webhook delle iscrizioni (`enrollments.ts:440-540`): subscriber orfani. Usare `onDuplicateKeyUpdate`, `AbortSignal.timeout` sulla `fetch` e un lock contro sync concorrenti.
  - Attivazione firmware (usare anche `fs/promises` e lo streaming del download).
  - PATCH delle impostazioni: se arriva solo l'URL, azzera la chiave API.
  - Import DB: fare un dump automatico prima del `DROP DATABASE` e registrarlo con audit.
- [x] **14. Lista iscritti.** `subscriber-list.ts` carica tutti gli iscritti, le iscrizioni e le presenze, poi ordina e pagina in memoria; lo stesso fa l'export delle presenze. Ordinare e paginare in SQL e arricchire solo le righe della pagina.
- [x] **15. Indici DB.**
  - Aggiungere `attendance(card_uid, read_timestamp)` e `attendance(subscriber_id, read_timestamp)`.
  - Aggiungere indici su `enrollments(start_date, end_date)`.
  - Rimuovere `card_rfid.idx_uid`, che duplica il vincolo UNIQUE.
- [x] **16. Audit.** Sostituire con `logAudit` gli `db.insert(auditLog)` diretti in `api/v1/subscribers/+server.ts` e `api/v1/subscribers/[id]/+server.ts`, e uniformare i nomi di azione ed entità.

### 🟡 Frontend

- [x] **17. Client HTTP e notifiche condivisi.**
  - `lib/utils/http.ts` con `apiFetch<T>()` e `ApiError`: oggi ci sono 35 `fetch()` scritte a mano.
  - Toast con `svelte-sonner`.
  - `ConfirmDialog.svelte` al posto di `confirm()`/`alert()` (attendance, settings) e dei dialog di conferma duplicati.
- [x] **18. Form action con `use:enhance` al posto delle fetch verso `/api`.**
  - `admin/users`: oggi carica la lista in `onMount`; va caricata nel `load`.
  - `settings`: 4 PATCH quasi identiche.
  - `cards`, `attendance`, `courses`.
- [x] **19. Componenti troppo grandi da spezzare.**
  - `settings` (727 righe): 5 card da estrarre.
  - `admin/users` (686): unificare i dialog di creazione e modifica in `UserFormDialog`.
  - `subscribers/[id]` (686) e `devices` (633, con 5 dialog).
  - `+layout.svelte`: estrarre NavGroup/NavItem e togliere i ruoli ARIA menubar/menu/menuitem.
  - `TutorialGuide` (632): circa 480 righe servono a riconoscere i testi italiani nel DOM. Sostituirle con gli attributi `data-tutorial-*` e togliere l'accoppiamento dal date-picker.
- [x] **20. Logica duplicata tra pagine.**
  - Il flusso di cancellazione card (`cards/[id]/erase` e `subscribers/[id]/write-card`) è duplicato e le copie sono già diverse.
  - `webserial.ts`: estrarre `sendAndAwait()` e `readJsonLines()` (5 copie, più diagnostic e provisioner).
  - Etichette e badge di stato card e ingresso/uscita in `lib/labels.ts`, più un componente `CardStatusBadge`.
  - Estrarre un componente `CopyButton`.
  - Filtri con `<form method="GET">` al posto dei `goto()` scritti a mano.
  - `AttendanceEditDialog` condiviso tra attendance e staff-attendance.
- [x] **21. Svelte 5 idiomatico.**
  - Sostituire `$app/stores` con `$app/state` (layout, attendance, staff-attendance).
  - Convertire in `$derived` scrivibili gli `$effect` che copiano valori (layout, devices, firmware, new-students).
  - Usare `MediaQuery` al posto del listener su resize e `SvelteSet` al posto dei Set copiati a ogni modifica.
  - Aggiungere le chiavi ai blocchi `{#each}`.
  - Aggiungere il cleanup dell'`$effect` in `CardQuickReader`.
- [x] **22. Settings: hydration e valori iniziali.**
  - Hydration mismatch in `settings/+page.svelte:66`: il valore letto da `window.location.origin` diverso tra server e client; usare `page.url.origin`.
  - I valori iniziali di confronto non vengono mai aggiornati dopo un salvataggio.
- [x] **23. UI kit.** _(completato su tutte le pagine)_
  - `<select>` e checkbox nativi sostituiti da `ui/native-select` e `ui/checkbox`.
  - Token del tema (`bg-card`, `bg-muted`, `text-foreground`, `text-muted-foreground`, `border-border`) al posto di `bg-white`/`text-gray-*`.
  - Dark mode non attivato: rimosse le classi `dark:` fuori da `components/ui`.
  - Import dei moduli ui: named per i componenti singoli (`import { Button } from '$lib/components/ui/button'`); namespace (`* as Dialog`, `* as Table`) ammesso per i gruppi.

### 🟢 Bassa priorità e pulizia

- [x] **24. Codice morto.**
  - Schemi non usati in `utils/validation.ts`.
  - Sanitizer e `apiRateLimiter` in `security.ts`.
  - `validateSession`, `requireRole` e `generateDeviceToken` in `auth.ts`.
  - `auditContext` e `queryAuditLogs` in `audit.ts`.
  - `serviceUnavailable` in `api.ts`.
  - La dipendenza `lucide-svelte`.
- [x] **25. Logging.** Circa 60 `console.*`, alcuni con dati personali. Passare a un logger strutturato con redazione dei campi (pino) e a un requestId in `locals`.
- [x] **26. Endpoint di salute duplicati.** Esistono `/status` e `/api/v1/health`. Tenerne uno solo, che restituisca solo lo stato: `/status` oggi è pubblico ed espone l'errore del DB.
- [x] **27. Policy password.** L'API accetta 8 caratteri, `validatePasswordStrength` ne richiede 12. Sceglierne una.
- [x] **28. Riepilogo settimanale.** Rischio di doppio invio: riservare prima la riga nel log (stato `pending`), poi inviare la mail. Separare anche il template dalla logica del job.
- [x] **29. Infrastruttura.**
  - Node 20 è fuori supporto: passare a 22 o 24 in `.nvmrc` e nel `Dockerfile`.
  - Nel `Dockerfile`, eseguire `npm prune --omit=dev` prima di copiare `node_modules`.
  - Due migrazioni hanno lo stesso numero `0011_*`.
  - Aggiornamenti major arretrati: `eslint-plugin-svelte` 3, `@sveltejs/vite-plugin-svelte`, `jose` 6.
  - Validare gli header proxy per l'IP del client (`XFF_DEPTH`/`ADDRESS_HEADER`) invece di fidarsi di `x-forwarded-for`.
- [x] **30. Coerenza dei testi.**
  - Parole inglesi nella UI in italiano (es. "release", "Save", "secret").
  - Maiuscole miste nei titoli.
  - Messaggi d'errore del server in inglese mostrati all'utente.
