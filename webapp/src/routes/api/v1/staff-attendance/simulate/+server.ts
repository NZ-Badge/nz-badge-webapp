import type { RequestHandler } from './$types';
import { AuthError } from '$lib/services/auth';
import { simulateStaffAttendance, StaffAttendanceError } from '$lib/services/staff-attendance';
import { authErrorResponse, badRequest, conflict, created, serverError } from '$lib/utils/api';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api/staff-attendance/simulate');

export const POST: RequestHandler = async ({ locals }) => {
	try {
		const actor = await locals.verifyUser();
		const result = await simulateStaffAttendance(actor);
		if (result.ignored) {
			return conflict(
				'Strisciata troppo vicina alla precedente. Riprova dopo l’intervallo configurato.',
				result
			);
		}
		return created(result);
	} catch (err) {
		if (err instanceof AuthError) return authErrorResponse(err);
		if (err instanceof StaffAttendanceError) return badRequest(err.message);
		log.error('Request failed', { err });
		return serverError('Errore interno');
	}
};
