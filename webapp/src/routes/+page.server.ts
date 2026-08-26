import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { verifyUserSession } from '$lib/services/auth';

export const load: PageServerLoad = async ({ cookies }) => {
	try {
		await verifyUserSession(cookies);
	} catch {
		redirect(303, '/login');
	}
	redirect(303, '/dashboard');
};
