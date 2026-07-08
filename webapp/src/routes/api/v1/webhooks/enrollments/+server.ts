import { timingSafeEqual } from 'node:crypto';
import type { RequestEvent } from '@sveltejs/kit';
import { z } from 'zod';
import { ok, badRequest, unauthorized, serverError } from '$lib/utils/api';
import { getWebhookSecret, processWebhookEnrollment } from '$lib/services/enrollments';
import type { ApiEnrollment } from '$lib/services/enrollments';

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

const enrollmentSchema = z.object({
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
	notes: z.string().nullable().optional(),
	submittedAt: z.string().nullable().optional(),
	status: z.enum(['PENDING', 'SUBMITTED', 'COMPLETED']),
	createdAt: z.string(),
	updatedAt: z.string()
});

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
		console.warn('[webhook/enrollments] Nessun secret configurato — chiamata rifiutata');
		return unauthorized('Webhook non configurato');
	}

	const incomingSecret = event.request.headers.get('X-Webhook-Secret') ?? '';
	if (!safeCompare(incomingSecret, secret)) {
		console.warn('[webhook/enrollments] Secret non valido');
		return unauthorized('Secret non valido');
	}

	// Parsing body
	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return badRequest('Invalid JSON body');
	}

	const parsed = enrollmentSchema.safeParse(body);
	if (!parsed.success) {
		return badRequest('Payload non valido', parsed.error.issues);
	}

	const item = parsed.data as ApiEnrollment;

	try {
		const result = await processWebhookEnrollment(item);
		return ok(result);
	} catch (err) {
		console.error('[webhook/enrollments] Errore durante elaborazione:', err);
		return serverError();
	}
}
