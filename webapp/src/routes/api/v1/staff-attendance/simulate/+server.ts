import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AuthError } from '$lib/services/auth';
import { simulateStaffAttendance, StaffAttendanceError } from '$lib/services/staff-attendance';

export const POST: RequestHandler = async ({ locals }) => {
	try {
		const actor = await locals.verifyUser();
		const result = await simulateStaffAttendance(actor);
		return json(result, { status: result.ignored ? 409 : 201 });
	} catch (err) {
		if (err instanceof AuthError) {
			return json({ error: err.message }, { status: err.code === 'UNAUTHORIZED' ? 401 : 403 });
		}
		if (err instanceof StaffAttendanceError) {
			return json({ error: err.message, code: err.code }, { status: 400 });
		}
		console.error('[staff-attendance/simulate] request failed:', err);
		return json({ error: 'Errore interno' }, { status: 500 });
	}
};
