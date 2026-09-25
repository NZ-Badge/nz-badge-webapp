/**
 * Audit Logging Service for Healthcare Compliance
 * Tracks all data access and modifications for HIPAA compliance
 */

import { db } from '$lib/db';
import { auditLog } from '$lib/db/schema';
import type { DbOrTx } from '$lib/db/types';
import { maskEmail, maskUid } from '$lib/utils/security';
import type { RequestEvent } from '@sveltejs/kit';
import { createLogger } from '$lib/server/logger';

const log = createLogger('audit');

// Action types for audit logging.
// Naming convention: generic CRUD verbs (CREATE/UPDATE/DELETE) + a lowercase singular
// entity type; domain-specific operations get their own UPPER_SNAKE action.
export type AuditAction =
	| 'CREATE'
	| 'UPDATE'
	| 'DELETE'
	| 'READ'
	| 'LOGIN'
	| 'LOGIN_FAILED'
	| 'LOGOUT'
	| 'EXPORT'
	| 'CARD_WRITE'
	| 'CARD_ERASE'
	| 'CARD_DISABLE'
	| 'CARD_ENABLE'
	| 'CARD_RESTORE'
	| 'CARD_DELETE'
	| 'SYNC_SHOPIFY'
	| 'SETTINGS_UPDATE'
	| 'DEVICE_REGISTER'
	| 'DEVICE_DISABLE'
	| 'FIRMWARE_ACTIVATE'
	| 'DB_IMPORT';

// Entity types that can be audited
export type AuditEntityType =
	| 'subscriber'
	| 'card'
	| 'attendance'
	| 'staff_attendance'
	| 'user'
	| 'device'
	| 'setting'
	| 'sync_log'
	| 'firmware'
	| 'database';

/**
 * Audit log entry structure
 */
interface AuditEntry {
	userId?: number;
	action: AuditAction;
	entityType?: AuditEntityType;
	entityId?: number;
	dataBefore?: Record<string, unknown>;
	dataAfter?: Record<string, unknown>;
	ipAddress?: string;
	userAgent?: string;
	/**
	 * Extra context. `audit_log` has no metadata column: it is stored under
	 * `dataAfter.metadata` (sanitized like the rest of the payload).
	 */
	metadata?: Record<string, unknown>;
}

/**
 * Sanitize data for audit log - remove sensitive fields
 */
function sanitizeAuditData(
	data: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
	if (!data) return undefined;

	const sensitiveFields = [
		'password',
		'passwordHash',
		'token',
		'tokenHash',
		'keyA',
		'keyB',
		'secret',
		'apiKey',
		'api_key'
	];
	const sanitized: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(data)) {
		// Skip sensitive fields entirely
		if (sensitiveFields.some((sf) => key.toLowerCase().includes(sf.toLowerCase()))) {
			sanitized[key] = '[REDACTED]';
			continue;
		}

		// Mask email fields
		if (key.toLowerCase().includes('email') && typeof value === 'string') {
			sanitized[key] = maskEmail(value);
			continue;
		}

		// Mask UID fields
		if ((key.toLowerCase().includes('uid') || key === 'cardUid') && typeof value === 'string') {
			sanitized[key] = maskUid(value);
			continue;
		}

		// Dates would otherwise be recursed into and stored as {}
		if (value instanceof Date) {
			sanitized[key] = value.toISOString();
			continue;
		}

		// Recursively sanitize nested objects
		if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
			sanitized[key] = sanitizeAuditData(value as Record<string, unknown>);
			continue;
		}

		sanitized[key] = value;
	}

	return sanitized;
}

/**
 * Client IP address as resolved by the adapter. Behind a reverse proxy adapter-node reads
 * it from `ADDRESS_HEADER`/`XFF_DEPTH`, so spoofed `X-Forwarded-For` values are ignored.
 */
function getClientIp(event: Pick<RequestEvent, 'getClientAddress'>): string {
	try {
		return event.getClientAddress();
	} catch {
		return 'unknown';
	}
}

/** `dataAfter` with `metadata` merged in under its own key (no dedicated column). */
function mergeMetadata(
	dataAfter: Record<string, unknown> | undefined,
	metadata: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
	if (!metadata || Object.keys(metadata).length === 0) return dataAfter;
	return { ...dataAfter, metadata };
}

/**
 * Log an audit event.
 * Pass `database` (a transaction handle) to write the entry in the caller's transaction,
 * so the audit row is committed or rolled back together with the change it describes.
 */
export async function logAudit(entry: AuditEntry, database: DbOrTx = db): Promise<void> {
	try {
		await database.insert(auditLog).values({
			userId: entry.userId,
			action: entry.action,
			entityType: entry.entityType,
			entityId: entry.entityId,
			dataBefore: sanitizeAuditData(entry.dataBefore),
			dataAfter: sanitizeAuditData(mergeMetadata(entry.dataAfter, entry.metadata)),
			ipAddress: entry.ipAddress,
			userAgent: entry.userAgent,
			createdAt: new Date()
		});
	} catch (err) {
		// Never throw from audit logging: record only non-sensitive identifiers.
		log.error('Failed to write audit log', {
			err,
			action: entry.action,
			entityType: entry.entityType,
			entityId: entry.entityId,
			userId: entry.userId
		});
	}
}

/** IP and user agent of a request, for services that call `logAudit` directly. */
export function getAuditRequestInfo(event: Pick<RequestEvent, 'getClientAddress' | 'request'>): {
	ipAddress: string;
	userAgent: string | undefined;
} {
	return {
		ipAddress: getClientIp(event),
		userAgent: event.request.headers.get('user-agent') ?? undefined
	};
}
