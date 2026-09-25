import type { RequestEvent } from '@sveltejs/kit';
import { ok, notFound, serverError, authErrorResponse } from '$lib/utils/api';
import { authorizeCardErase } from '$lib/services/card-writer';
import { cardWriterErrorResponse } from '$lib/server/card-errors';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api/card/[id]/erase');

export async function POST(event: RequestEvent): Promise<Response> {
	let adminUser;
	try {
		adminUser = await event.locals.verifyStaffOrAdmin();
	} catch (err) {
		return authErrorResponse(err);
	}

	void adminUser; // verifica autenticazione, dati non usati qui

	const id = Number(event.params.id);
	if (isNaN(id) || id <= 0) return notFound('ID card non valido');

	try {
		const result = await authorizeCardErase(id);
		return ok(result);
	} catch (err) {
		const response = cardWriterErrorResponse(err);
		if (response) return response;
		log.error('Request failed', { err });
		return serverError();
	}
}
