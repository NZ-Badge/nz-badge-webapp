import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { AuthError, requireAdmin } from '$lib/services/auth';

export const load: PageServerLoad = async ({ locals }) => {
	// Only admin can access card diagnostics
	try {
		const user = await locals.verifyAdmin();
		requireAdmin(user);
	} catch (err) {
		if (err instanceof AuthError) {
			if (err.code === 'FORBIDDEN') {
				error(403, 'Admin access required');
			}
			error(401, 'Unauthorized');
		}
		throw err;
	}

	return {};
};
