/**
 * Audit Logging Service for Healthcare Compliance
 * Tracks all data access and modifications for HIPAA compliance
 */

import { db } from '$lib/db';
import { auditLog } from '$lib/db/schema';
import { maskEmail, maskUid } from '$lib/utils/security';
import type { RequestEvent } from '@sveltejs/kit';

// Action types for audit logging
export type AuditAction =
	| 'CREATE'
	| 'UPDATE'
	| 'DELETE'
	| 'READ'
	| 'LOGIN'
	| 'LOGOUT'
	| 'EXPORT'
	| 'CARD_WRITE'
	| 'CARD_ERASE'
	| 'CARD_DISABLE'
	| 'CARD_ENABLE'
	| 'SYNC_SHOPIFY'
	| 'SETTINGS_UPDATE'
	| 'DEVICE_REGISTER'
	| 'DEVICE_DISABLE';

// Entity types that can be audited
export type AuditEntityType =
	| 'subscriber'
	| 'card'
	| 'attendance'
	| 'staff_attendance'
	| 'user'
	| 'device'
	| 'setting'
	| 'sync_log';

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
		'secret'
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
 * Get client IP address from request
 */
function getClientIp(event: RequestEvent): string {
	const forwarded = event.request.headers.get('x-forwarded-for');
	if (forwarded) {
		return forwarded.split(',')[0].trim();
	}
	return event.request.headers.get('x-real-ip') ?? 'unknown';
}

/**
 * Log an audit event
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
	try {
		await db.insert(auditLog).values({
			userId: entry.userId,
			action: entry.action,
			entityType: entry.entityType,
			entityId: entry.entityId,
			dataBefore: sanitizeAuditData(entry.dataBefore),
			dataAfter: sanitizeAuditData(entry.dataAfter),
			ipAddress: entry.ipAddress,
			userAgent: entry.userAgent,
			createdAt: new Date()
		});
	} catch (err) {
		// Never throw from audit logging - log to console as fallback
		console.error('[AUDIT] Failed to write audit log:', err);
		console.error(
			'[AUDIT] Entry:',
			JSON.stringify({
				...entry,
				dataBefore: '[sanitized]',
				dataAfter: '[sanitized]'
			})
		);
	}
}

/**
 * Create audit logger bound to a request event
 * Automatically extracts user info, IP, and user agent
 */
export function createAuditLogger(event: RequestEvent, userId?: number) {
	const ipAddress = getClientIp(event);
	const userAgent = event.request.headers.get('user-agent') ?? undefined;

	return {
		log: (entry: Omit<AuditEntry, 'ipAddress' | 'userAgent'>) =>
			logAudit({
				...entry,
				userId,
				ipAddress,
				userAgent
			}),

		logLogin: (success: boolean, metadata?: Record<string, unknown>) =>
			logAudit({
				userId,
				action: 'LOGIN',
				ipAddress,
				userAgent,
				metadata: { success, ...metadata }
			}),

		logLogout: () =>
			logAudit({
				userId,
				action: 'LOGOUT',
				ipAddress,
				userAgent
			}),

		logDataAccess: (
			entityType: AuditEntityType,
			entityId: number,
			action: 'READ' | 'UPDATE' | 'DELETE' = 'READ',
			dataBefore?: Record<string, unknown>,
			dataAfter?: Record<string, unknown>
		) =>
			logAudit({
				userId,
				action,
				entityType,
				entityId,
				dataBefore,
				dataAfter,
				ipAddress,
				userAgent
			}),

		logExport: (
			entityType: AuditEntityType,
			recordCount: number,
			filters?: Record<string, unknown>
		) =>
			logAudit({
				userId,
				action: 'EXPORT',
				entityType,
				metadata: { recordCount, filters },
				ipAddress,
				userAgent
			}),

		logCardOperation: (
			action: 'CARD_WRITE' | 'CARD_ERASE' | 'CARD_DISABLE' | 'CARD_ENABLE',
			cardId: number,
			uid: string,
			subscriberId?: number
		) =>
			logAudit({
				userId,
				action,
				entityType: 'card',
				entityId: cardId,
				metadata: {
					uid: maskUid(uid),
					subscriberId
				},
				ipAddress,
				userAgent
			})
	};
}

/**
 * Async context storage for audit logging
 * Allows automatic association of operations with the current request
 */
class AuditContext {
	private context = new Map<string, ReturnType<typeof createAuditLogger>>();

	set(requestId: string, logger: ReturnType<typeof createAuditLogger>): void {
		this.context.set(requestId, logger);
	}

	get(requestId: string): ReturnType<typeof createAuditLogger> | undefined {
		return this.context.get(requestId);
	}

	remove(requestId: string): void {
		this.context.delete(requestId);
	}
}

export const auditContext = new AuditContext();

/**
 * Query audit logs with filtering
 * For admin audit trail review
 */
export async function queryAuditLogs(options: {
	userId?: number;
	entityType?: AuditEntityType;
	entityId?: number;
	action?: AuditAction;
	from?: Date;
	to?: Date;
	limit?: number;
	offset?: number;
}): Promise<{
	logs: Array<{
		id: number;
		userId: number | null;
		action: string;
		entityType: string | null;
		entityId: number | null;
		createdAt: Date | null;
	}>;
	total: number;
}> {
	const { /* userId, entityType, entityId, action, from, to, */ limit = 50, offset = 0 } = options;

	// Build query - simplified for now
	// TODO: Add dynamic where clauses when needed
	const logs = await db
		.select({
			id: auditLog.id,
			userId: auditLog.userId,
			action: auditLog.action,
			entityType: auditLog.entityType,
			entityId: auditLog.entityId,
			createdAt: auditLog.createdAt
		})
		.from(auditLog)
		.limit(limit)
		.offset(offset)
		.orderBy(auditLog.createdAt);

	// Get total count
	const countResult = await db.select({ count: sql`COUNT(*)` }).from(auditLog);
	const total = Number(countResult[0]?.count ?? 0);

	return { logs, total };
}

// Need to import sql for the count query
import { sql } from 'drizzle-orm';
