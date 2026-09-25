import type { RequestEvent } from '@sveltejs/kit';
import { ok, unauthorized, notFound, badRequest, serverError } from '$lib/utils/api';
import { AuthError } from '$lib/services/auth';
import { CardWriterError, disableCard } from '$lib/services/card-writer';

export async function POST(event: RequestEvent): Promise<Response> {
	let adminUser;
	try {
		adminUser = await event.locals.verifyStaffOrAdmin();
	} catch (err) {
		return err instanceof AuthError ? unauthorized(err.message) : serverError();
	}

	const id = Number(event.params.id);
	if (isNaN(id) || id <= 0) return notFound('Invalid card ID');

	try {
		const updated = await disableCard(id, adminUser);
		return ok(updated);
	} catch (err) {
		if (err instanceof CardWriterError) {
			if (err.code === 'NOT_FOUND') return notFound('Card not found');
			if (err.code === 'VALIDATION_ERROR') return notFound('Invalid card ID');
			if (err.code === 'INVALID_STATE') return badRequest(err.message);
		}
		console.error('[card/disable] error:', err);
		return serverError();
	}
}
