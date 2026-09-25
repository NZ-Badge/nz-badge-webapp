import type { RequestEvent } from '@sveltejs/kit';
import { z } from 'zod';
import { ok, badRequest, serverError, formatZodError, authErrorResponse } from '$lib/utils/api';
import { authorizeCardErase } from '$lib/services/card-writer';
import { cardWriterErrorResponse } from '$lib/server/card-errors';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api/card/erase');

const cardEraseSchema = z.object({
	card_id: z.number().int().positive()
});

export async function POST(event: RequestEvent): Promise<Response> {
	try {
		await event.locals.verifyStaffOrAdmin();
	} catch (err) {
		return authErrorResponse(err);
	}

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return badRequest('JSON non valido');
	}

	const parsed = cardEraseSchema.safeParse(body);
	if (!parsed.success) return badRequest(formatZodError(parsed.error));

	try {
		const result = await authorizeCardErase(parsed.data.card_id);
		return ok(result);
	} catch (err) {
		const response = cardWriterErrorResponse(err);
		if (response) return response;
		log.error('Request failed', { err });
		return serverError();
	}
}
