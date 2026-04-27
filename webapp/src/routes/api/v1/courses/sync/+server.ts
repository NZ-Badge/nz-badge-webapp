import type { RequestEvent } from '@sveltejs/kit';
import { ok, unauthorized, serverError } from '$lib/utils/api';
import { syncEnrollments } from '$lib/services/enrollments';
import { AuthError } from '$lib/services/auth';

export async function POST(event: RequestEvent): Promise<Response> {
	try {
		await event.locals.verifyAdmin();
	} catch (err) {
		return err instanceof AuthError ? unauthorized(err.message) : serverError();
	}

	try {
		const result = await syncEnrollments('manual');
		return ok(result);
	} catch (err) {
		console.error('[courses/sync] error:', err);
		return serverError(err instanceof Error ? err.message : 'Sync failed');
	}
}
