import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { dev } from '$app/environment';
import bcrypt from 'bcryptjs';
import { db } from '$lib/db';
import { users } from '$lib/db/schema';
import { eq } from 'drizzle-orm';
import { createAdminSession, verifyUserSession } from '$lib/services/auth';
import { logAudit } from '$lib/services/audit';
import { loginEmailRateLimiter, loginIpRateLimiter } from '$lib/utils/security';

const TOO_MANY_ATTEMPTS = 'Troppi tentativi di accesso. Riprova tra qualche minuto.';

function getClientIp(getClientAddress: () => string): string | undefined {
	try {
		return getClientAddress();
	} catch {
		return undefined;
	}
}

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
	login: async ({ request, cookies, getClientAddress }) => {
		const data = await request.formData();
		const email = data.get('email')?.toString().trim();
		const password = data.get('password')?.toString();

		if (!email || !password) {
			return fail(400, { error: 'Credenziali non valide' });
		}

		const ipAddress = getClientIp(getClientAddress);
		const userAgent = request.headers.get('user-agent')?.slice(0, 500) ?? undefined;
		const emailKey = `login:email:${email.toLowerCase()}`;
		// Both limiters are always evaluated so that each attempt is counted on both keys.
		const ipLimited = loginIpRateLimiter.isLimited(`login:ip:${ipAddress ?? 'unknown'}`);
		const emailLimited = loginEmailRateLimiter.isLimited(emailKey);
		if (ipLimited || emailLimited) {
			await logAudit({
				action: 'LOGIN_FAILED',
				entityType: 'user',
				dataAfter: { email, reason: 'rate_limited' },
				ipAddress,
				userAgent
			});
			return fail(429, { error: TOO_MANY_ATTEMPTS });
		}

		const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

		// Messaggio generico — non rivela se l'email esiste
		if (!user || user.status !== 'active' || !(await bcrypt.compare(password, user.passwordHash))) {
			await logAudit({
				userId: user?.id,
				action: 'LOGIN_FAILED',
				entityType: 'user',
				entityId: user?.id,
				dataAfter: {
					email,
					reason: !user ? 'unknown_user' : user.status !== 'active' ? 'inactive' : 'bad_password'
				},
				ipAddress,
				userAgent
			});
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
		} catch (err) {
			console.error('[LOGIN] Error creating session:', err);
			return fail(500, { error: 'Impossibile creare la sessione' });
		}

		loginEmailRateLimiter.reset(emailKey);
		console.log('[LOGIN] Session created for user id:', user.id);
		await logAudit({
			userId: user.id,
			action: 'LOGIN',
			entityType: 'user',
			entityId: user.id,
			ipAddress,
			userAgent
		});

		redirect(303, '/dashboard');
	},

	logout: async ({ cookies }) => {
		cookies.delete('session', { path: '/' });
		redirect(303, '/login');
	}
};
