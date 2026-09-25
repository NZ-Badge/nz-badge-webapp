import type { PageServerLoad } from './$types';
import { requirePageAdmin } from '$lib/services/auth';

export const load: PageServerLoad = async ({ locals }) => {
	// Only admin can access card diagnostics
	await requirePageAdmin(locals);

	return {};
};
