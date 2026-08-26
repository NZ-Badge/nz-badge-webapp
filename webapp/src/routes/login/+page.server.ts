import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { dev } from '$app/environment';
import bcrypt from 'bcryptjs';
import { db } from '$lib/db';
import { users } from '$lib/db/schema';
import { eq } from 'drizzle-orm';
import { createAdminSession, verifyUserSession } from '$lib/services/auth';

export const load: PageServerLoad = async ({ cookies }) => {
	let hasValidSession = false;
	try {
		await verifyUserSession(cookies);
		hasValidSession = true;
	} catch {
		// Remove stale/expired/disabled-user cookies so the login page cannot loop.
		cookies.delete('session', { path: '/' });
	}
	if (hasValidSession) redirect(303, '/dashboard');
	return {};
};

export const actions: Actions = {
	login: async ({ request, cookies }) => {
		const data = await request.formData();
		const email = data.get('email')?.toString().trim();
		const password = data.get('password')?.toString();

		if (!email || !password) {
			return fail(400, { error: 'Credenziali non valide' });
		}

		const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

		// Messaggio generico — non rivela se l'email esiste
		if (!user || user.status !== 'active' || !(await bcrypt.compare(password, user.passwordHash))) {
			return fail(400, { error: 'Credenziali non valide' });
		}

		// Create session using auth service
		try {
			const { token, expires } = await createAdminSession(user);

			cookies.set('session', token, {
				path: '/',
				httpOnly: true,
				secure: !dev,
				sameSite: 'strict',
				expires
			});

			console.log('[LOGIN] Session created for user:', user.email);
		} catch (err) {
			console.error('[LOGIN] Error creating session:', err);
			return fail(500, { error: 'Impossibile creare la sessione' });
		}

		redirect(303, '/dashboard');
	},

	logout: async ({ cookies }) => {
		cookies.delete('session', { path: '/' });
		redirect(303, '/login');
	}
};
