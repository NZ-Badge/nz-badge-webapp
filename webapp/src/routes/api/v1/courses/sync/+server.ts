import type { RequestEvent } from '@sveltejs/kit';
import { ok, conflict, serverError, authErrorResponse } from '$lib/utils/api';
import { EnrollmentSyncInProgressError, syncEnrollments } from '$lib/services/enrollments';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api/courses/sync');

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
		if (err instanceof EnrollmentSyncInProgressError) return conflict(err.message);
		log.error('Enrollment sync failed', { err });
		return serverError(err instanceof Error ? err.message : 'Sincronizzazione non riuscita');
	}
}
