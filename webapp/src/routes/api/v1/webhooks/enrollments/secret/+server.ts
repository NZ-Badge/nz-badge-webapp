import type { RequestEvent } from '@sveltejs/kit';
import { ok, serverError, authErrorResponse } from '$lib/utils/api';
import { getWebhookSecret, regenerateWebhookSecret } from '$lib/services/enrollments';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api/webhooks/enrollments/secret');

/**
 * GET /api/v1/webhooks/enrollments/secret
 * Restituisce il secret corrente (admin only).
 */
export async function GET(event: RequestEvent): Promise<Response> {
	try {
		await event.locals.verifyAdminOnly();
	} catch (err) {
		return authErrorResponse(err);
	}

	try {
		const secret = await getWebhookSecret();
		return ok({ secret });
	} catch (err) {
		log.error('GET failed', { err });
		return serverError();
	}
}

/**
 * POST /api/v1/webhooks/enrollments/secret
 * Genera (o rigenera) il secret webhook (admin only).
 */
export async function POST(event: RequestEvent): Promise<Response> {
	try {
		await event.locals.verifyAdminOnly();
	} catch (err) {
		return authErrorResponse(err);
	}

	try {
		const secret = await regenerateWebhookSecret();
		return ok({ secret });
	} catch (err) {
		log.error('POST failed', { err });
		return serverError();
	}
}
