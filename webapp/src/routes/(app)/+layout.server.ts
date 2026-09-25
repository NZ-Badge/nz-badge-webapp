import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { canAccessAppPath, requirePageUser } from '$lib/services/auth';
import { version } from '../../../package.json';

// Access is also enforced in hooks.server.ts and in every page load/action: this layout
// only renders the styled 403 page for full-page loads and exposes the user to the UI.
export const load: LayoutServerLoad = async ({ locals, url }) => {
	const user = await requirePageUser(locals);
	if (!canAccessAppPath(user.role, url.pathname)) {
		error(403, 'Accesso non consentito');
	}

	return {
		user: {
			id: user.id,
			name: user.name || '',
			email: user.email,
			role: user.role
		},
		version
	};
};
