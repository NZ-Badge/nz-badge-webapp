import type { RequestEvent } from '@sveltejs/kit';
import { ok, unauthorized, serverError } from '$lib/utils/api';
import { AuthError } from '$lib/services/auth';
import { getWebhookSecret, regenerateWebhookSecret } from '$lib/services/enrollments';

/**
 * GET /api/v1/webhooks/enrollments/secret
 * Restituisce il secret corrente (admin only).
 */
export async function GET(event: RequestEvent): Promise<Response> {
	try {
		await event.locals.verifyAdmin();
	} catch (err) {
		return err instanceof AuthError ? unauthorized(err.message) : serverError();
	}

	try {
		const secret = await getWebhookSecret();
		return ok({ secret });
	} catch (err) {
		console.error('[webhook/secret] GET error:', err);
		return serverError();
	}
}

/**
 * POST /api/v1/webhooks/enrollments/secret
 * Genera (o rigenera) il secret webhook (admin only).
 */
export async function POST(event: RequestEvent): Promise<Response> {
	try {
		await event.locals.verifyAdmin();
	} catch (err) {
		return err instanceof AuthError ? unauthorized(err.message) : serverError();
	}

	try {
		const secret = await regenerateWebhookSecret();
		return ok({ secret });
	} catch (err) {
		console.error('[webhook/secret] POST error:', err);
		return serverError();
	}
}
