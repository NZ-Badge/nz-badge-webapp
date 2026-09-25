import type { RequestEvent } from '@sveltejs/kit';
import { testEnrollmentApiConnection } from '$lib/services/enrollments';
import { ok, serverError, authErrorResponse } from '$lib/utils/api';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api/settings/enrollment-api/test');

/**
 * POST /api/v1/settings/enrollment-api/test
 * Testa la connessione all'API esterna delle iscrizioni.
 * URL e chiave nel body (form non ancora salvato) hanno la precedenza su quelli salvati.
 */
export async function POST(event: RequestEvent): Promise<Response> {
	try {
		await event.locals.verifyAdminOnly();
	} catch (err) {
		return authErrorResponse(err);
	}

	let body: { url?: unknown; key?: unknown } | null = null;
	try {
		body = await event.request.json();
	} catch {
		// body assente o non-JSON: si usano i valori salvati
	}

	try {
		return ok(
			await testEnrollmentApiConnection({
				url: typeof body?.url === 'string' ? body.url : null,
				key: typeof body?.key === 'string' ? body.key : null
			})
		);
	} catch (err) {
		log.error('Enrollment API test failed', { err });
		return serverError();
	}
}
