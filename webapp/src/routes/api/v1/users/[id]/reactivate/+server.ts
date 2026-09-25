import { requireAdmin } from '$lib/services/auth';
import { reactivateUser } from '$lib/services/users';
import { ok, authErrorResponse } from '$lib/utils/api';
import { userErrorResponse } from '../../errors';
import type { RequestHandler } from './$types';

/** POST /api/v1/users/:id/reactivate - Reactivate a disabled user account (admin only). */
export const POST: RequestHandler = async ({ params, locals }) => {
	let currentUser;
	try {
		currentUser = await locals.verifyStaffOrAdmin();
		requireAdmin(currentUser);
	} catch (err) {
		return authErrorResponse(err);
	}

	try {
		return ok({ user: await reactivateUser(Number(params.id), currentUser) });
	} catch (err) {
		return userErrorResponse(err);
	}
};
