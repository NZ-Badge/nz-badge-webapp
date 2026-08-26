import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { AuthError } from '$lib/services/auth';
import { version } from '../../../package.json';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	try {
		const user = await locals.verifyUser();
		if (user.role === 'collaborator') {
			const allowedPrefixes = ['/dashboard', '/staff-attendance', '/my-attendance', '/copyrights'];
			if (!allowedPrefixes.some((prefix) => url.pathname.startsWith(prefix))) {
				error(403, 'Accesso non consentito');
			}
		}

		// Log per debug
		console.log('[LAYOUT] User loaded:', {
			id: user.id,
			name: user.name,
			email: user.email,
			role: user.role
		});

		return {
			user: {
				id: user.id,
				name: user.name || '',
				email: user.email,
				role: user.role
			},
			version
		};
	} catch (err) {
		console.error('[LAYOUT] Error loading user:', err);
		if (err instanceof AuthError) {
			redirect(303, '/login');
		}
		throw err;
	}
};
