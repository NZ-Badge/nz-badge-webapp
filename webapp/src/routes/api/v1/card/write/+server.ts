import type { RequestEvent } from '@sveltejs/kit';
import { cardWriteSchema } from '$lib/utils/validation';
import { ok, badRequest, serverError, formatZodError, authErrorResponse } from '$lib/utils/api';
import { authorizeCardWrite, authorizeUserCardWrite } from '$lib/services/card-writer';
import { requireStaffManager } from '$lib/services/auth';
import { cardWriterErrorResponse } from '$lib/server/card-errors';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api/card/write');

export async function POST(event: RequestEvent): Promise<Response> {
	try {
		const user = await event.locals.verifyStaffOrAdmin();
		requireStaffManager(user);
	} catch (err) {
		return authErrorResponse(err);
	}

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return badRequest('JSON non valido');
	}

	const parsed = cardWriteSchema.safeParse(body);
	if (!parsed.success) return badRequest(formatZodError(parsed.error));

	try {
		const result = parsed.data.user_id
			? await authorizeUserCardWrite(parsed.data.user_id)
			: await authorizeCardWrite(parsed.data.subscriber_id!);
		return ok(result);
	} catch (err) {
		const response = cardWriterErrorResponse(err);
		if (response) return response;
		log.error('Card write authorization failed', { err });
		return serverError();
	}
}
