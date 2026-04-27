import type { RequestEvent } from '@sveltejs/kit';
import { cardValidateSchema } from '$lib/utils/validation';
import { ok, badRequest, unauthorized, serverError, formatZodError, conflict } from '$lib/utils/api';
import { confirmCardWrite, CardWriterError } from '$lib/services/card-writer';
import { AuthError } from '$lib/services/auth';

export async function POST(event: RequestEvent): Promise<Response> {
	let adminUser;
	try {
		adminUser = await event.locals.verifyAdmin();
	} catch (err) {
		return err instanceof AuthError ? unauthorized(err.message) : serverError();
	}

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return badRequest('Invalid JSON body');
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
		}

		const message = err instanceof Error ? err.message : 'Unknown error';
		if (message.includes('session') || message.includes('expired') || message.includes('Invalid')) {
			return badRequest(message);
		}
		console.error('[card/validate] error:', err);
		return serverError(message);
	}
}
