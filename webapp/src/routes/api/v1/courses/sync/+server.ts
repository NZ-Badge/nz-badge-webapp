import type { RequestEvent } from '@sveltejs/kit';
import { ok, serverError, authErrorResponse } from '$lib/utils/api';
import { syncEnrollments } from '$lib/services/enrollments';

export async function POST(event: RequestEvent): Promise<Response> {
	try {
		await event.locals.verifyStaffOrAdmin();
	} catch (err) {
		return authErrorResponse(err);
	}

	try {
		const result = await syncEnrollments('manual');
		return ok(result);
	} catch (err) {
		console.error('[courses/sync] error:', err);
		return serverError(err instanceof Error ? err.message : 'Sync failed');
	}
}
