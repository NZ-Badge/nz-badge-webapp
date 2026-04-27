import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { verifyAdminSession } from '$lib/services/auth';

export const load: PageServerLoad = async ({ cookies }) => {
	try {
		await verifyAdminSession(cookies);
		redirect(303, '/dashboard');
	} catch {
		redirect(303, '/login');
	}
};
