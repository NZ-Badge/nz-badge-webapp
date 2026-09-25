import type { RequestEvent } from '@sveltejs/kit';
import { z } from 'zod';
import { ok, badRequest, serverError, formatZodError, authErrorResponse } from '$lib/utils/api';
import { confirmCardErase } from '$lib/services/card-writer';
import { cardWriterErrorResponse } from '$lib/server/card-errors';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api/card/[id]/erase/confirm');

const schema = z.object({
	session_token: z.string().uuid()
});

export async function POST(event: RequestEvent): Promise<Response> {
	let adminUser;
	try {
		adminUser = await event.locals.verifyStaffOrAdmin();
	} catch (err) {
		return authErrorResponse(err);
	}

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return badRequest('JSON non valido');
	}

	const parsed = schema.safeParse(body);
	if (!parsed.success) return badRequest(formatZodError(parsed.error));

	try {
		const result = await confirmCardErase(parsed.data.session_token, adminUser);
		return ok(result);
	} catch (err) {
		const response = cardWriterErrorResponse(err);
		if (response) return response;
		log.error('Request failed', { err });
		return serverError();
	}
}
