import type { PageServerLoad } from './$types';
import { requirePageAdmin } from '$lib/services/auth';
import { getSettingsOverview } from '$lib/services/settings-view';

export const load: PageServerLoad = async ({ locals }) => {
	// Only admin can access settings
	await requirePageAdmin(locals);

	// Secrets are masked: the page only learns whether they are configured.
	return getSettingsOverview();
};
