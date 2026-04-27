# ril-presenze — Web App

SvelteKit 2 dashboard for managing RFID attendance tracking. Built with TypeScript, Tailwind CSS 4, shadcn-svelte, and Drizzle ORM on MySQL 8.

## Prerequisites

- [ddev](https://ddev.readthedocs.io/) v1.24+
- Docker (required by ddev)

Node.js and MySQL are provided by ddev — no local installation required.

## Setup

```bash
# 1. Start the ddev environment (MySQL 8 + Node.js 20)
ddev start

# 2. Copy and configure environment variables
cp .env.example .env
# Edit .env with your Shopify credentials and JWT secret

# 3. Install dependencies
ddev exec -d /var/www/html/webapp npm install

# 4. Push schema to the database (creates/updates tables from schema.ts)
ddev exec -d /var/www/html/webapp npm run db:push

# 5. (Optional) Apply manual SQL migrations if present
# Some migrations in src/lib/db/migrations/ may need manual execution:
# ddev exec "mysql -h db -u db -pdb db < webapp/src/lib/db/migrations/XXXX_migration_name.sql"

# 6. Start the dev server
ddev exec -d /var/www/html/webapp npm run dev
```

The app is available at `http://ril-presenze.ddev.site:5173` (or the Vite dev port exposed by ddev).

## Environment Variables

| Variable                 | Description                   | Example                         |
| ------------------------ | ----------------------------- | ------------------------------- |
| `DATABASE_URL`           | MySQL connection string       | `mysql://db:db@db/db`           |
| `JWT_SECRET`             | Secret for signing API tokens | `change-me-in-production`       |
| `SHOPIFY_STORE_URL`      | Shopify store URL             | `https://mystore.myshopify.com` |
| `SHOPIFY_ACCESS_TOKEN`   | Shopify Admin API token       | `shpat_...`                     |
| `SHOPIFY_WEBHOOK_SECRET` | Webhook HMAC secret           | `whsec_...`                     |
| `NODE_ENV`               | Runtime environment           | `development`                   |

Inside ddev, `DATABASE_URL` is set automatically to `mysql://db:db@db/db`.

### Security Notes

- **JWT_SECRET**: Must be at least 32 characters in production
- **NODE_ENV**: Set to `production` for production builds (enables stricter CSP)
- All secrets should be rotated regularly per organizational policy

## npm Scripts

| Command               | Description                                 |
| --------------------- | ------------------------------------------- |
| `npm run dev`         | Start Vite dev server (hot reload)          |
| `npm run build`       | Production build                            |
| `npm run check`       | Type-check with svelte-check                |
| `npm run lint`        | Prettier + ESLint check                     |
| `npm run format`      | Auto-format all files                       |
| `npm run test`        | Run unit tests (Vitest)                     |
| `npm run test:e2e`    | Run end-to-end tests (Playwright)           |
| `npm run db:push`     | Push schema to DB from schema.ts (recommended) |
| `npm run db:generate` | Generate Drizzle migration files (not used)    |
| `npm run db:migrate`  | Apply Drizzle migrations (requires generated files) |

All commands must be run inside ddev: `ddev exec -d /var/www/html/webapp <command>`

## Database Schema Management

This project uses two approaches for database schema changes:

### 1. `db:push` (Development / Default)

Synchronizes the database schema directly from `schema.ts` without creating migration files:

```bash
ddev exec "cd webapp && npm run db:push"
```

**Use this for:**
- Initial database setup
- Development changes to the schema
- Quick prototyping

### 2. Manual SQL Migrations

Some features require manual SQL execution for data migrations or complex schema changes:

```bash
# Execute a specific migration file
ddev exec "mysql -h db -u db -pdb db < webapp/src/lib/db/migrations/0004_mifare_keys.sql"
```

**Migration files in `src/lib/db/migrations/`:**
| File | Purpose |
|------|---------|
| `0001_rename_italian_columns.sql` | Renamed columns to Italian |
| `0002_card_rfid_soft_delete.sql` | Added soft delete to card_rfid |
| `0003_settings_table.sql` | Created settings table |
| `0004_mifare_keys.sql` | MIFARE keys table + single-key setting |
| `0008_firmware_releases.sql` | **NEW**: tabella OTA firmware releases |

> **Note:** `db:migrate` requires generated Drizzle migration files (in `drizzle/` folder) which are not used in this project. Use `db:push` or manual SQL execution instead.

## Project Structure

```
webapp/
├── src/
│   ├── app.html              # HTML shell
│   ├── app.css               # Global styles (Tailwind 4 + shadcn-svelte theme)
│   ├── app.d.ts              # SvelteKit ambient types + WebSerial types
│   ├── hooks.server.ts       # Server hooks (CSP, security headers, auth)
│   ├── lib/
│   │   ├── components/
│   │   │   └── ui/           # shadcn-svelte components (generated)
│   │   ├── db/
│   │   │   ├── schema.ts     # Drizzle ORM table definitions
│   │   │   ├── index.ts      # DB connection singleton
│   │   │   └── migrations/   # Drizzle migration files
│   │   ├── services/         # Business logic
│   │   │   ├── audit.ts      # Audit logging for compliance
│   │   │   ├── auth.ts       # Authentication & authorization
│   │   │   ├── card-writer.ts# Card lifecycle management
│   │   │   ├── mifare-keys.ts# MIFARE key management
│   │   │   └── shopify.ts    # Shopify integration
│   │   ├── stores/           # Svelte 5 reactive stores
│   │   │   └── webserial.svelte.ts  # WebSerial connection state
│   │   ├── types/            # Shared TypeScript types
│   │   └── utils/            # Utility functions
│   │       ├── api.ts        # API response helpers
│   │       ├── date.ts       # Date utilities
│   │       ├── security.ts   # Security utilities (XSS, CSP, etc.)
│   │       ├── validation.ts # Input validation schemas
│   │       ├── webserial.ts  # WebSerial communication
│   │       └── webserial-diagnostic.ts  # Diagnostic mode
│   └── routes/               # SvelteKit file-based routes
├── tests/
│   ├── unit/                 # Vitest unit tests
│   └── e2e/                  # Playwright end-to-end tests
├── .ddev/                    # ddev configuration
├── SECURITY.md               # Security & compliance documentation
├── drizzle.config.ts         # Drizzle Kit configuration
├── svelte.config.js          # SvelteKit configuration
├── vite.config.ts            # Vite + Tailwind + Vitest
└── .env.example              # Environment variable template
```

## Tech Stack

| Layer           | Technology                           |
| --------------- | ------------------------------------ |
| Framework       | SvelteKit 2 + Svelte 5 (Runes)       |
| Language        | TypeScript 5                         |
| Styling         | Tailwind CSS 4 + shadcn-svelte       |
| State Management| Svelte 5 Runes (`$state`, `$derived`) |
| ORM             | Drizzle ORM                          |
| Database        | MySQL 8                              |
| Security        | bcryptjs, jose (JWT), CSP nonces     |
| Validation      | Zod schemas                          |
| Dev environment | ddev                                 |
| Unit testing    | Vitest                               |
| E2E testing     | Playwright                           |

### Svelte 5 Runes

This project uses Svelte 5's new reactivity model:

```typescript
// Global state in .svelte.ts files
export const connection = $state<SerialConnection>({
  state: 'disconnected',
  error: null,
  port: null
});

// Derived values
const status = $derived(getConnectionStatusFromState(connection.state));

// Props in components
let { data, children } = $props();
```

## Security & Compliance

The application implements comprehensive security measures designed for healthcare environments requiring HIPAA compliance.

### Content Security Policy (CSP)

A strict CSP is enforced via `hooks.server.ts`:
- Nonces for inline scripts (`script-src 'nonce-{random}'`)
- Strict dynamic script loading
- No external resources (all assets self-hosted)
- Frame protection (`frame-ancestors 'none'`)
- Upgrade insecure requests

### Security Headers

All responses include hardened security headers:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security` (HSTS)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` (restricts USB, camera, etc.)
- `Cache-Control: no-store` for sensitive data

### Input Validation & Sanitization

All user input is validated and sanitized:
- **XSS Prevention**: HTML sanitization, event handler stripping
- **Email Validation**: RFC-compliant with dangerous char filtering
- **ID Validation**: Positive integer verification
- **Search Queries**: Length limits and dangerous char removal

```typescript
import { sanitizeEmail, sanitizeId, sanitizeSearchQuery } from '$lib/utils/security';
```

### Authentication & Authorization

#### Device Authentication (IoT Readers)
- Bearer token + Device ID verification
- bcrypt token hashing
- Rate limiting: 5 attempts per 5 minutes
- Automatic device ping updates

#### Admin Session Management
- JWT-based sessions (8-hour expiry for hospital shifts)
- Secure httpOnly cookies
- Role-based access control (admin/operator)
- Session validation on every request

### Audit Logging

All sensitive operations are logged for compliance:

| Action | Description |
|--------|-------------|
| `LOGIN` / `LOGOUT` | Authentication events |
| `CARD_WRITE` | RFID card written |
| `CARD_ERASE` | Card erased (soft delete) |
| `CARD_ENABLE` / `CARD_DISABLE` | Card state changes |
| `CREATE` / `UPDATE` / `DELETE` | Data modifications |
| `EXPORT` | Data exports |
| `SETTINGS_UPDATE` | Configuration changes |

Logs include: user ID, action, entity affected, before/after data (sanitized), IP address, and timestamp.

### Rate Limiting

- **API**: 100 requests per minute per IP
- **Authentication**: 5 attempts per 5 minutes per device
- Automatic cleanup of old entries

### Error Handling

- Internal errors logged but never exposed to client
- Generic error messages for security
- PII sanitized from all logs
- Structured JSON logging for monitoring

### WebSerial Security

- Explicit user permission required for USB access
- Vendor ID filtering (ESP32 chips only)
- Connection state validation
- Automatic cleanup on disconnect
- No persistent device access

See [SECURITY.md](./SECURITY.md) for detailed security documentation.

## OTA Firmware Update

La webapp gestisce gli aggiornamenti firmware over-the-air (OTA) per i reader station. Ad ogni riavvio il firmware chiama il server per verificare se è disponibile una versione più recente; se sì, la scarica e si riflasha autonomamente.

### Come funziona

```
Reader boot
  └── WiFi connesso
      └── GET /api/v1/firmware/check?version=0.1.1
          ├── { update_available: false }  →  avvio normale
          └── { update_available: true, version: "0.2.0", url: "..." }
              └── GET /api/v1/firmware/download/0.2.0  →  flash  →  reboot
```

Il server controlla solo la release contrassegnata come **Attiva**. Se nessuna release è attiva, i device non si aggiornano.

### Rilasciare una nuova versione

**1. Compilare il firmware**

```bash
cd firmware/reader-station
pio run -e pn532-sh1106
# Il binario si trova in .pio/build/pn532-sh1106/firmware.bin
```

Verificare che `FIRMWARE_VERSION` in `src/config.h` sia aggiornato (es. `"0.2.0"`).

**2. Caricare sulla webapp**

1. Vai su **Admin → Firmware** nel menu laterale
2. Inserisci la versione (es. `0.2.0`) — deve corrispondere esattamente a `FIRMWARE_VERSION` nel firmware
3. Seleziona il file `.bin` (`.pio/build/pn532-sh1106/firmware.bin`)
4. Aggiungi note di rilascio opzionali
5. Clicca **Carica**

**3. Attivare la release**

Nella tabella delle release, clicca **Attiva** sulla riga appena caricata.

Da quel momento tutti i reader al prossimo riavvio riceveranno l'aggiornamento.

### Rollback

Per tornare a una versione precedente:

1. Vai su **Admin → Firmware**
2. Clicca **Attiva** sulla versione precedente

La versione attiva precedente viene disattivata automaticamente. I device aggiorneranno (o torneranno) alla versione attiva al prossimo riavvio.

Per bloccare tutti gli aggiornamenti, clicca **Ritira** sulla release attiva — nessuna release attiva = nessun aggiornamento distribuito.

### Storage file binari

I file `.bin` sono salvati localmente nella directory:

```
localfiles/
└── firmware/
    └── reader-station/
        ├── 0.2.0.bin
        └── 0.3.0.bin
```

Questa directory deve essere inclusa nel backup di produzione ma non nel repository git (già in `.gitignore`).

### API endpoints (autenticazione device richiesta)

| Endpoint | Descrizione |
|----------|-------------|
| `GET /api/v1/firmware/check?version=X` | Controlla se c'è un aggiornamento disponibile; aggiorna anche `firmwareVersion` in `device_registry` |
| `GET /api/v1/firmware/download/[version]` | Scarica il binario della release indicata (solo se attiva) |

### Migrazione database

La funzionalità richiede la tabella `firmware_releases`. In sviluppo:

```bash
ddev exec "mysql -h db -u db -pdb db < webapp/src/lib/db/migrations/0008_firmware_releases.sql"
```

In produzione la migrazione viene applicata automaticamente dalla CI.

---

## Webhook Iscrizioni

La webapp espone un endpoint webhook che permette al server remoto di inviare iscrizioni in push, senza attendere la sincronizzazione manuale. Il comportamento è identico al sync REST: deduplicazione per `id`, creazione automatica del subscriber se l'email non esiste.

Vedi [WEBHOOK.md](./WEBHOOK.md) per la documentazione completa: configurazione, formato payload, esempi, gestione del secret e indicazioni per il server remoto.

---

## Database Schema

Eleven tables managed by Drizzle ORM:

- `users` — Operator/admin accounts
- `subscribers` — Enrolled members (synced from Shopify)
- `card_rfid` — RFID card assignments
- `attendance` — Attendance events from reader stations
- `shopify_sync_log` — Shopify webhook/polling audit trail
- `shopify_products_map` — Product → course mapping
- `device_registry` — Reader/writer device registry with auth tokens
- `audit_log` — User action audit log
- `settings` — Application configuration settings
- `mifare_keys` — Global MIFARE key storage for single-key mode
- `firmware_releases` — OTA firmware release management

## Attendance Settings

The application provides configurable settings for attendance tracking behavior, accessible from the **Settings** page in the admin dashboard.

### Available Settings

| Setting | Key | Type | Default | Description |
|---------|-----|------|---------|-------------|
| **Azzera tipo ingresso ogni giorno** | `reset_entry_type_daily` | boolean | `true` | When enabled, the first swipe of each day is always recorded as an "entry" (ingresso), regardless of the previous day's state. When disabled, the entry/exit logic continues from the previous day's last state. |
| **Intervallo minimo tra strisciate** | `min_swipe_interval_minutes` | integer | `15` | Minimum time interval (in minutes) between two swipes from the same card. If a user swipes twice within this interval, the second swipe is ignored (recorded as `validated: false` with note). |
| **Usa chiave unica MIFARE** | `use_single_mifare_key` | boolean | `false` | When enabled, all RFID cards use the same global MIFARE key pair. When disabled, each card gets a unique key pair. See [MIFARE Key Management](#mifare-key-management) below. |

### How the Settings Work

#### Reset Entry Type Daily (`reset_entry_type_daily`)

Controls how the system determines whether a swipe is an "entry" or "exit":

- **Enabled (`true`)**: 
  - First swipe of the day → always "entry"
  - Same day: entry → exit → entry → exit...
  - New day: resets to "entry"
  
- **Disabled (`false`)**:
  - Alternates continuously without daily reset
  - Example: If last swipe yesterday was "entry", today's first swipe will be "exit"

#### Minimum Swipe Interval (`min_swipe_interval_minutes`)

Prevents duplicate or accidental swipes:

- If a user swipes the same card multiple times within the configured interval, only the first swipe is processed normally
- Subsequent swipes are:
  - Stored in the database for audit purposes
  - Marked as `validated: false`
  - Tagged with note: `Ignored: within {X}min interval`
  - Returned to the device with action `"ignored"`

### MIFARE Key Management

The application supports two modes for MIFARE key management on RFID cards:

#### Unique Keys Mode (Default)

- Each card gets a unique pair of keys (Key A and Key B) generated during writing
- Higher security - compromise of one card doesn't affect others
- Requires storing individual keys in the database (`card_rfid.key_a`, `card_rfid.key_b`)

#### Single Key Mode

- All cards use the same global key pair stored in `mifare_keys` table
- Simplified management - easier to provision new readers
- Lower security - if keys are compromised, all cards are affected

**Important restrictions when enabling Single Key Mode:**

1. **Cannot enable if active cards exist**: The system checks for any active (non-deleted) cards in the database. If cards exist, you must first disable or delete them before enabling single key mode.
2. **Existing cards won't work**: Once single key mode is enabled, any previously written cards (with unique keys) will no longer be readable.
3. **Key regeneration**: You can regenerate the global keys at any time from the Settings page, but this will invalidate all existing cards written with the previous keys.

#### Database Schema for MIFARE Keys

```sql
CREATE TABLE mifare_keys (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL DEFAULT 'default',
    key_a VARCHAR(12) NOT NULL,  -- 6 bytes in hex (12 chars)
    key_b VARCHAR(12) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW() ON UPDATE NOW()
);
```

### Managing Settings

Settings can be managed in two ways:

1. **Web UI**: Navigate to `/settings` in the admin dashboard
2. **API**: `GET /api/v1/settings` (read) or `PATCH /api/v1/settings` (update)

Example API usage:
```bash
# Get current settings (includes MIFARE key config and active card count)
curl -H "Authorization: Bearer $TOKEN" https://ril-presenze.ddev.site/api/v1/settings

# Update settings
curl -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reset_entry_type_daily": false, "min_swipe_interval_minutes": 10}' \
  https://ril-presenze.ddev.site/api/v1/settings

# Enable single key mode (fails with 409 if active cards exist)
curl -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"use_single_mifare_key": true}' \
  https://ril-presenze.ddev.site/api/v1/settings

# Regenerate global MIFARE keys
curl -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"regenerate_mifare_keys": true}' \
  https://ril-presenze.ddev.site/api/v1/settings
```

# Regenerate global MIFARE keys
curl -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"regenerate_mifare_keys": true}' \
  https://ril-presenze.ddev.site/api/v1/settings
```

## Development Best Practices

### Security Checklist

When adding new features, ensure:

- [ ] **Input Validation**: Use `sanitizeXxx` utilities from `$lib/utils/security`
- [ ] **Authorization**: Check permissions with `verifyAdmin()` or `verifyDevice()`
- [ ] **Audit Logging**: Log sensitive operations via `logAudit()`
- [ ] **Error Handling**: Use generic error messages for clients, log details server-side
- [ ] **XSS Prevention**: Sanitize user content before display
- [ ] **Rate Limiting**: Add rate limits for new API endpoints

### Example: Secure API Endpoint

```typescript
// src/routes/api/v1/example/+server.ts
import type { RequestEvent } from '@sveltejs/kit';
import { ok, unauthorized, serverError } from '$lib/utils/api';
import { AuthError } from '$lib/services/auth';
import { logAudit } from '$lib/services/audit';
import { sanitizeId } from '$lib/utils/security';

export async function POST(event: RequestEvent) {
  // 1. Authenticate
  let user;
  try {
    user = await event.locals.verifyAdmin();
  } catch (err) {
    return err instanceof AuthError ? unauthorized() : serverError();
  }

  // 2. Validate input
  const body = await event.request.json();
  const id = sanitizeId(body.id);
  if (!id) {
    return badRequest('Invalid ID');
  }

  // 3. Perform operation
  const result = await doSomething(id);

  // 4. Log audit
  await logAudit({
    userId: user.id,
    action: 'UPDATE',
    entityType: 'example',
    entityId: id,
    dataAfter: { /* sanitized data */ }
  });

  return ok(result);
}
```

### Svelte 5 Runes Best Practices

```svelte
<script lang="ts">
  // Props
  let { data, children } = $props();
  
  // Local state
  let count = $state(0);
  
  // Derived state (computed)
  let doubled = $derived(count * 2);
  
  // Effects (side effects)
  $effect(() => {
    console.log('Count changed:', count);
  });
</script>
```

### Type Safety

- Use strict TypeScript (`strict: true` in tsconfig)
- Define types in `$lib/types/` for shared interfaces
- Use Zod schemas for runtime validation
- Leverage Drizzle's type inference for database entities

### Testing

```bash
# Run unit tests
npm run test

# Run E2E tests
npm run test:e2e

# Type check
npm run check

# Lint
npm run lint
```

### Database Migrations

For production changes, prefer manual SQL migrations:

1. Create migration file: `src/lib/db/migrations/0005_feature_name.sql`
2. Test locally: `ddev exec "mysql -h db -u db -pdb db < webapp/src/lib/db/migrations/0005_feature_name.sql"`
3. Document in README
4. Apply to production during maintenance window

## License

[Add your license here]
