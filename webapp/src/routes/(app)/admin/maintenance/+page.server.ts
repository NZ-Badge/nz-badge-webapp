import { requirePageAdmin } from '$lib/services/auth';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	await requirePageAdmin(locals);
};
