import type { PageServerLoad } from './$types';
import { requirePageStaff } from '$lib/services/auth';

export const load: PageServerLoad = async ({ locals }) => {
	const user = await requirePageStaff(locals);
	return { canManageAccounts: user.role === 'admin' };
};
