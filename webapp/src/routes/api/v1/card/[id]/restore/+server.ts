import type { RequestEvent } from '@sveltejs/kit';
import { ok, notFound, serverError, badRequest, authErrorResponse } from '$lib/utils/api';
import { restoreCard } from '$lib/services/card-writer';

export async function POST(event: RequestEvent): Promise<Response> {
	let adminUser;
	try {
		adminUser = await event.locals.verifyStaffOrAdmin();
	} catch (err) {
		return authErrorResponse(err);
	}

	const id = Number(event.params.id);
	if (isNaN(id) || id <= 0) return notFound('Invalid card ID');

	try {
		await restoreCard(id, adminUser);
		return ok({ restored: true });
	} catch (err) {
		const msg = err instanceof Error ? err.message : 'Unknown error';
		if (msg.includes('not found')) return notFound(msg);
		if (msg.includes('stato')) return badRequest(msg);
		console.error('[card/restore] error:', err);
		return serverError();
	}
}
