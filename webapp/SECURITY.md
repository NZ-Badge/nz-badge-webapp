# Security & Compliance Documentation

## Overview

This document outlines the security measures implemented in the RFID Attendance webapp, designed for healthcare environments requiring HIPAA compliance and data protection.

## Security Architecture

### 1. Content Security Policy (CSP)

A strict CSP is implemented via `hooks.server.ts` to prevent XSS attacks:

```
default-src 'self'
script-src 'self' 'nonce-{random}' 'strict-dynamic'
style-src 'self' 'unsafe-inline'
img-src 'self' data: blob:
font-src 'self'
connect-src 'self'
media-src 'self'
object-src 'none'
frame-ancestors 'none'
base-uri 'self'
form-action 'self'
upgrade-insecure-requests
```

- **Nonce-based scripts**: Each request generates a unique CSP nonce
- **Strict dynamic**: Allows only scripts with the correct nonce
- **No inline scripts**: Prevents XSS injection via script tags

### 2. Security Headers

All responses include hardened security headers:

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Content-Type-Options` | `nosniff` | Prevents MIME type sniffing |
| `X-Frame-Options` | `DENY` | Prevents clickjacking |
| `X-XSS-Protection` | `1; mode=block` | Legacy XSS protection |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limits referrer info |
| `Permissions-Policy` | Restrictive | Limits browser features |
| `Strict-Transport-Security` | HSTS | Forces HTTPS |
| `Cache-Control` | `no-store` | Prevents caching sensitive data |

### 3. Authentication & Authorization

#### Device Authentication (IoT Readers)
- Bearer token authentication via `Authorization` header
- Device ID verification via `X-Device-ID` header
- bcrypt token hashing for secure storage
- Rate limiting: 5 attempts per 5 minutes per device
- Automatic last ping update on successful auth

#### Admin Session Management
- JWT-based sessions with 8-hour expiry
- Secure httpOnly cookies
- Role-based access control (admin/operator)
- Session validation on every request

### 4. Input Validation & Sanitization

#### XSS Prevention (`lib/utils/security.ts`)
- HTML sanitization for user content
- Event handler stripping
- Dangerous protocol removal (javascript:, vbscript:)
- HTML entity encoding

#### Input Sanitization
```typescript
sanitizeEmail(email: string)    // Validates and normalizes email
sanitizeId(id: unknown)         // Validates positive integers
sanitizeUuid(uuid: unknown)     // Validates UUID format
sanitizeSearchQuery(query)      // Limits length, removes dangerous chars
```

#### Password Security
- Minimum 12 characters
- Complexity requirements (upper, lower, number, special)
- Common pattern detection
- bcrypt hashing with 12 rounds

### 5. Audit Logging

All sensitive operations are logged for compliance:

#### Logged Actions
- `LOGIN` / `LOGOUT` - Authentication events
- `CREATE` / `UPDATE` / `DELETE` - Data modifications
- `CARD_WRITE` / `CARD_ERASE` - Card operations
- `EXPORT` - Data exports
- `SETTINGS_UPDATE` - Configuration changes

#### Log Format
```typescript
{
  userId: number;
  action: string;
  entityType: string;
  entityId: number;
  dataBefore: object;  // Sanitized
  dataAfter: object;   // Sanitized
  ipAddress: string;   // Hashed for privacy
  userAgent: string;
  timestamp: Date;
}
```

#### Sensitive Data Masking
- Emails: `j***e@example.com`
- Card UIDs: `A1B2...C3D4`
- Passwords/keys: `[REDACTED]`

### 6. Rate Limiting

#### API Rate Limiting
- 100 requests per minute per IP
- Automatic cleanup of old entries
- HTTP 429 response with Retry-After header

#### Authentication Rate Limiting
- 5 login attempts per 5 minutes
- Progressive backoff
- Resets on successful auth

### 7. Error Handling

#### Secure Error Messages
- Internal errors logged but not exposed
- Client receives generic "Internal Server Error"
- Stack traces never sent to client
- PII sanitized from logs

#### Log Structure
```json
{
  "level": "error",
  "timestamp": "2024-01-01T00:00:00Z",
  "status": 500,
  "url": "/api/v1/...",
  "method": "POST",
  "message": "[sanitized]",
  "error": "[sanitized]",
  "requestId": "unique-id"
}
```

### 8. WebSerial Security

#### USB Device Connection
- Explicit user permission required
- Vendor ID filtering (ESP32 chips only)
- Connection state validation
- Automatic disconnect handling
- No persistent device access

#### Communication Security
- 115200 baud fixed rate
- JSON line-delimited protocol
- 30-second operation timeout
- Signal line configuration for ESP32

## Healthcare Compliance Features

### HIPAA Considerations

1. **Access Controls**
   - Unique user identification
   - Role-based permissions
   - Automatic session timeout (8 hours)
   - Emergency access procedures

2. **Audit Controls**
   - Comprehensive logging of all PHI access
   - Immutable audit trail
   - Regular audit log review capability

3. **Integrity Controls**
   - Data validation on input
   - Transaction-based database operations
   - Soft deletes for data recovery

4. **Transmission Security**
   - HTTPS enforcement
   - Secure cookie configuration
   - No PHI in URLs or query parameters

### Data Retention

- Attendance records: Retained indefinitely
- Audit logs: Retained per organizational policy
- Deleted cards: Soft delete with key retention for physical erasure
- Session data: 5-minute TTL

## Security Best Practices for Developers

### When Adding New Features

1. **Always validate input** using `sanitizeXxx` utilities
2. **Log sensitive operations** via `logAudit()`
3. **Check permissions** before data access
4. **Use parameterized queries** (Drizzle ORM handles this)
5. **Never expose stack traces** to clients
6. **Sanitize all user-generated content** before display

### Security Checklist

- [ ] Input validation implemented
- [ ] Authorization checks added
- [ ] Audit logging included
- [ ] Error handling is secure
- [ ] No PII in logs or errors
- [ ] XSS prevention applied
- [ ] Rate limiting considered

## Incident Response

### Security Incident Procedure

1. **Identify** - Detect unusual activity via logs
2. **Contain** - Disable affected accounts/devices
3. **Investigate** - Review audit logs
4. **Remediate** - Fix vulnerability
5. **Report** - Document incident

### Contact

For security issues, contact the system administrator immediately.

## Security Updates

This document is updated with each security-related code change. Last updated: 2024-03-10

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [HIPAA Security Rule](https://www.hhs.gov/hipaa/for-professionals/security/index.html)
- [SvelteKit Security](https://kit.svelte.dev/docs/security)
- [Web Serial API](https://wicg.github.io/serial/)
