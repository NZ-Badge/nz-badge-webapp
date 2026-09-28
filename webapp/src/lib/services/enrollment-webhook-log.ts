import { count, desc, eq } from 'drizzle-orm';
import { db } from '$lib/db';
import { enrollmentWebhookLog } from '$lib/db/schema';
import { logAudit } from '$lib/services/audit';

export type WebhookLogStatus = typeof enrollmentWebhookLog.$inferSelect.status;

const SECRET_FIELD = /secret|token|password|api.?key|authorization|hash/i;

/** Keep the webhook body useful for diagnosis without persisting credentials. */
export function serializeWebhookPayload(value: unknown): string {
	const redact = (input: unknown): unknown => {
		if (Array.isArray(input)) return input.map(redact);
		if (input !== null && typeof input === 'object') {
			return Object.fromEntries(
				Object.entries(input).map(([key, nested]) => [
					key,
					SECRET_FIELD.test(key) ? '[REDACTED]' : redact(nested)
				])
			);
		}
		return input;
	};
	return JSON.stringify(redact(value), null, 2) ?? 'null';
}

export async function createWebhookLog(payload: string, externalId?: string): Promise<number> {
	const [created] = await db
		.insert(enrollmentWebhookLog)
		.values({ payload, externalId: externalId?.slice(0, 50) ?? null })
		.$returningId();
	return created.id;
}

export async function finishWebhookLog(
	id: number,
	status: WebhookLogStatus,
	httpStatus: number,
	externalId?: string
): Promise<void> {
	await db
		.update(enrollmentWebhookLog)
		.set({ status, httpStatus, ...(externalId ? { externalId: externalId.slice(0, 50) } : {}) })
		.where(eq(enrollmentWebhookLog.id, id));
}

export async function listWebhookLogs(page: number, pageSize: number) {
	const [{ total }] = await db.select({ total: count() }).from(enrollmentWebhookLog);
	const totalPages = Math.max(1, Math.ceil(total / pageSize));
	const currentPage = Math.min(Math.max(1, page), totalPages);
	const rows = await db
		.select()
		.from(enrollmentWebhookLog)
		.orderBy(desc(enrollmentWebhookLog.receivedAt), desc(enrollmentWebhookLog.id))
		.limit(pageSize)
		.offset((currentPage - 1) * pageSize);
	return {
		rows: rows.map((row) => ({ ...row, receivedAt: row.receivedAt.toISOString() })),
		total,
		page: currentPage,
		totalPages
	};
}

export async function deleteWebhookLog(id: number, actorId: number): Promise<boolean> {
	return db.transaction(async (tx) => {
		const [existing] = await tx
			.select({ id: enrollmentWebhookLog.id })
			.from(enrollmentWebhookLog)
			.where(eq(enrollmentWebhookLog.id, id))
			.limit(1);
		if (!existing) return false;
		await tx.delete(enrollmentWebhookLog).where(eq(enrollmentWebhookLog.id, id));
		await logAudit(
			{ userId: actorId, action: 'DELETE', entityType: 'webhook_log', entityId: id },
			tx
		);
		return true;
	});
}

export async function clearWebhookLogs(actorId: number): Promise<number> {
	return db.transaction(async (tx) => {
		const [{ total }] = await tx.select({ total: count() }).from(enrollmentWebhookLog);
		if (total === 0) return 0;
		await tx.delete(enrollmentWebhookLog);
		await logAudit(
			{
				userId: actorId,
				action: 'DELETE',
				entityType: 'webhook_log',
				dataBefore: { count: total }
			},
			tx
		);
		return total;
	});
}
