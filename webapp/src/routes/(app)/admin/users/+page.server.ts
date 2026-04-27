import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { AuthError, requireAdmin } from '$lib/services/auth';

export const load: PageServerLoad = async ({ locals }) => {
	try {
		const user = await locals.verifyAdmin();
		
		// Only admin can access user management
		requireAdmin(user);
		
		return {};
	} catch (err) {
		if (err instanceof AuthError) {
			if (err.code === 'FORBIDDEN') {
				error(403, 'Admin access required');
			}
			redirect(303, '/login');
		}
		throw err;
	}
};
