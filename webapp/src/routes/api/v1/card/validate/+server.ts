import type { RequestEvent } from '@sveltejs/kit';
import { cardValidateSchema } from '$lib/utils/validation';
import {
	ok,
	badRequest,
	serverError,
	formatZodError,
	conflict,
	notFound,
	authErrorResponse
} from '$lib/utils/api';
import { confirmCardWrite, CardWriterError } from '$lib/services/card-writer';
import { requireStaffManager } from '$lib/services/auth';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api/card/validate');

export async function POST(event: RequestEvent): Promise<Response> {
	let adminUser;
	try {
		adminUser = await event.locals.verifyStaffOrAdmin();
		requireStaffManager(adminUser);
	} catch (err) {
		return authErrorResponse(err);
	}

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return badRequest('JSON non valido');
	}

	const parsed = cardValidateSchema.safeParse(body);
	if (!parsed.success) return badRequest(formatZodError(parsed.error));

	try {
		const card = await confirmCardWrite(
			parsed.data.session_token,
			parsed.data.uid,
			adminUser,
			parsed.data.allow_reuse_deleted ?? false
		);
		return ok(card);
	} catch (err) {
		if (err instanceof CardWriterError) {
			if (err.code === 'SESSION_EXPIRED' || err.code === 'VALIDATION_ERROR') {
				return badRequest(err.message);
			}
			if (err.code === 'UID_IN_DELETED_HISTORY' || err.code === 'UID_ALREADY_EXISTS') {
				return conflict(err.message, {
					code: err.code,
					uid: parsed.data.uid
				});
			}
			if (err.code === 'NOT_FOUND') return notFound(err.message);
			if (err.code === 'INVALID_STATE') return conflict(err.message);
		}

		log.error('Card write confirmation failed', { err });
		return serverError();
	}
}
