import type { RequestEvent } from '@sveltejs/kit';
import { ok, unauthorized, notFound, serverError, badRequest } from '$lib/utils/api';
import { AuthError } from '$lib/services/auth';
import { authorizeCardErase } from '$lib/services/card-writer';

export async function POST(event: RequestEvent): Promise<Response> {
	let adminUser;
	try {
		adminUser = await event.locals.verifyAdmin();
	} catch (err) {
		return err instanceof AuthError ? unauthorized(err.message) : serverError();
	}

	void adminUser; // verifica autenticazione, dati non usati qui

	const id = Number(event.params.id);
	if (isNaN(id) || id <= 0) return notFound('Invalid card ID');

	try {
		const result = await authorizeCardErase(id);
		return ok(result);
	} catch (err) {
		const msg = err instanceof Error ? err.message : 'Unknown error';
		if (msg.includes('not found')) return notFound(msg);
		if (msg.includes('non cancellabile') || msg.includes('Chiave')) return badRequest(msg);
		console.error('[card/erase] error:', err);
		return serverError();
	}
}
