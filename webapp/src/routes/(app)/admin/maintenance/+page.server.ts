import { error } from '@sveltejs/kit';
import { AuthError, requireAdmin } from '$lib/services/auth';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	try {
		requireAdmin(await locals.verifyAdmin());
	} catch (err) {
		if (err instanceof AuthError) {
			error(err.code === 'FORBIDDEN' ? 403 : 401, 'Accesso non consentito');
		}
		throw err;
	}
};
