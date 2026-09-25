import type { RequestEvent } from '@sveltejs/kit';
import { ok, notFound, serverError, authErrorResponse } from '$lib/utils/api';
import { softDeleteCard } from '$lib/services/card-writer';
import { cardWriterErrorResponse } from '$lib/server/card-errors';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api/card/[id]/delete');

export async function POST(event: RequestEvent): Promise<Response> {
	let adminUser;
	try {
		adminUser = await event.locals.verifyStaffOrAdmin();
	} catch (err) {
		return authErrorResponse(err);
	}

	const id = Number(event.params.id);
	if (isNaN(id) || id <= 0) return notFound('ID card non valido');

	try {
		const result = await softDeleteCard(id, adminUser);
		return ok(result);
	} catch (err) {
		const response = cardWriterErrorResponse(err);
		if (response) return response;
		log.error('Request failed', { err });
		return serverError();
	}
}
