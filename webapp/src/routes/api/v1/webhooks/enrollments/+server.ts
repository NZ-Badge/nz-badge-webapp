import { timingSafeEqual } from 'node:crypto';
import type { RequestEvent } from '@sveltejs/kit';
import { z } from 'zod';
import { ok, badRequest, unauthorized, serverError } from '$lib/utils/api';
import { getWebhookSecret, processWebhookEnrollment } from '$lib/services/enrollments';
import type { ApiEnrollment } from '$lib/services/enrollments';
import {
	createWebhookLog,
	finishWebhookLog,
	serializeWebhookPayload,
	type WebhookLogStatus
} from '$lib/services/enrollment-webhook-log';
import { createLogger } from '$lib/server/logger';
import { ENROLLMENT_SCHEDULE_MODES } from '$lib/db/schema';
import { isDateKey } from '$lib/utils/date';

const log = createLogger('api/webhooks/enrollments');

async function startLog(payload: string, externalId?: string): Promise<number | null> {
	try {
		return await createWebhookLog(payload, externalId);
	} catch {
		log.error('Could not record authenticated webhook');
		return null;
	}
}

async function finishLog(
	id: number | null,
	status: WebhookLogStatus,
	httpStatus: number,
	externalId?: string
): Promise<void> {
	if (id === null) return;
	try {
		await finishWebhookLog(id, status, httpStatus, externalId);
	} catch {
		log.error('Could not update webhook log', { logId: id });
	}
}

const participantSchema = z.object({
	index: z.number().int().positive(),
	firstName: z.string(),
	lastName: z.string(),
	email: z.string().email().nullable().optional(),
	phone: z.string().nullable().optional(),
	fiscalCode: z.string().nullable().optional()
});

const enrollmentTypeSchema = z.object({
	id: z.number().int().positive(),
	name: z.string(),
	courseClass: z.string(),
	courseType: z.string(),
	duration: z.number().int().nonnegative()
});

const scheduleDaySchema = z.object({
	date: z.string().refine(isDateKey, 'Data non valida (atteso YYYY-MM-DD)')
});

const nonContiguousDaysSchema = z
	.array(scheduleDaySchema, { message: 'scheduleDays obbligatorio per i corsi non contigui' })
	.min(1, 'scheduleDays obbligatorio per i corsi non contigui');

const enrollmentSchema = z
	.object({
		id: z.string(),
		orderId: z.string(),
		orderName: z.string().nullable().optional(),
		lineItemId: z.string(),
		shopifyLineItemId: z.string().nullable().optional(),
		internalLineItemId: z.string().nullable().optional(),
		productId: z.string().nullable().optional(),
		variantId: z.string().nullable().optional(),
		productTitle: z.string().nullable().optional(),
		variantTitle: z.string().nullable().optional(),
		quantity: z.number().int().positive(),
		customerEmail: z.string().email(),
		customerDisplayName: z.string().nullable().optional(),
		participants: z.array(participantSchema).default([]),
		firstName: z.string().nullable().optional(),
		lastName: z.string().nullable().optional(),
		phone: z.string().nullable().optional(),
		fiscalCode: z.string().nullable().optional(),
		vatNumber: z.string().nullable().optional(),
		courseClass: z.string().nullable().optional(),
		enrollmentType: enrollmentTypeSchema.nullable().optional(),
		preferredDate: z.string().nullable().optional(),
		endDate: z.string().nullable().optional(),
		// "" counts as absent (stored schedule unchanged).
		scheduleMode: z.preprocess(
			(value) => (value === '' ? null : value),
			z.enum(ENROLLMENT_SCHEDULE_MODES).nullable().optional()
		),
		// Validated only for non-contiguous courses (see superRefine); ignored otherwise.
		scheduleDays: z.unknown().optional(),
		notes: z.string().nullable().optional(),
		submittedAt: z.string().nullable().optional(),
		status: z.enum(['PENDING', 'SUBMITTED', 'COMPLETED']),
		createdAt: z.string(),
		updatedAt: z.string()
	})
	.superRefine((value, ctx) => {
		if (!value.scheduleMode || value.scheduleMode === 'CONTIGUOUS') return;
		const days = nonContiguousDaysSchema.safeParse(value.scheduleDays);
		for (const issue of days.success ? [] : days.error.issues) {
			ctx.addIssue({ ...issue, path: ['scheduleDays', ...issue.path] } as z.IssueData);
		}
	})
	.transform(({ scheduleDays, ...value }) => ({
		...value,
		scheduleDays:
			value.scheduleMode && value.scheduleMode !== 'CONTIGUOUS'
				? (scheduleDays as z.infer<typeof nonContiguousDaysSchema>)
				: undefined
	}));

function safeCompare(a: string, b: string): boolean {
	const aBuf = Buffer.from(a);
	const bBuf = Buffer.from(b);
	if (aBuf.length !== bBuf.length) return false;
	return timingSafeEqual(aBuf, bBuf);
}

/**
 * POST /api/v1/webhooks/enrollments
 *
 * Riceve un singolo enrollment via webhook dal server remoto.
 * Richiede header: X-Webhook-Secret: <secret>
 */
export async function POST(event: RequestEvent): Promise<Response> {
	// Verifica secret
	const secret = await getWebhookSecret();
	if (!secret) {
		log.warn('No webhook secret configured: request rejected');
		return unauthorized('Webhook non configurato');
	}

	const incomingSecret = event.request.headers.get('X-Webhook-Secret') ?? '';
	if (!safeCompare(incomingSecret, secret)) {
		log.warn('Invalid webhook secret');
		return unauthorized('Secret non valido');
	}

	// Record only authenticated payloads; never store the secret header.
	let body: unknown;
	try {
		body = JSON.parse(await event.request.text());
	} catch {
		const logId = await startLog('[JSON non valido: corpo non archiviato]');
		await finishLog(logId, 'invalid_json', 400);
		return badRequest('JSON non valido');
	}
	const externalId =
		body && typeof body === 'object' && 'id' in body && typeof body.id === 'string'
			? body.id
			: undefined;
	const logId = await startLog(serializeWebhookPayload(body), externalId);

	const parsed = enrollmentSchema.safeParse(body);
	if (!parsed.success) {
		await finishLog(logId, 'invalid_payload', 400);
		return badRequest('Payload non valido', parsed.error.issues);
	}

	const item = parsed.data as ApiEnrollment;

	try {
		const result = await processWebhookEnrollment(item);
		await finishLog(logId, item.status === 'PENDING' ? 'ignored' : 'processed', 200, item.id);
		return ok(result);
	} catch (err) {
		await finishLog(logId, 'failed', 500, item.id);
		log.error('Webhook processing failed', { err });
		return serverError();
	}
}
