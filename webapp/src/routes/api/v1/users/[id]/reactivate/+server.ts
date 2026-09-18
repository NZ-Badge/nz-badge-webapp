import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/db';
import { users, type User } from '$lib/db/schema';
import { AuthError, requireAdmin } from '$lib/services/auth';
import { logAudit } from '$lib/services/audit';
import type { RequestHandler } from './$types';

function sanitizeUser(user: User) {
	const { passwordHash, ...sanitized } = user;
	void passwordHash;
	return sanitized;
}

/** POST /api/v1/users/:id/reactivate - Reactivate a disabled user account (admin only). */
export const POST: RequestHandler = async ({ params, locals }) => {
	try {
		const currentUser = await locals.verifyAdmin();
		requireAdmin(currentUser);

		const id = Number(params.id);
		if (!Number.isInteger(id) || id <= 0) {
			return json({ error: 'ID utente non valido' }, { status: 400 });
		}

		const [targetUser] = await db.select().from(users).where(eq(users.id, id)).limit(1);
		if (!targetUser) {
			return json({ error: 'Utente non trovato' }, { status: 404 });
		}
		if (targetUser.status !== 'deleted') {
			return json({ error: 'L’utente è già attivo' }, { status: 409 });
		}

		await db.update(users).set({ status: 'active', deletedAt: null }).where(eq(users.id, id));

		await logAudit({
			userId: currentUser.id,
			action: 'UPDATE',
			entityType: 'user',
			entityId: id,
			dataBefore: { status: targetUser.status, deletedAt: targetUser.deletedAt },
			dataAfter: { status: 'active', deletedAt: null }
		});

		const [reactivatedUser] = await db.select().from(users).where(eq(users.id, id)).limit(1);
		return json({ user: sanitizeUser(reactivatedUser) });
	} catch (err) {
		if (err instanceof AuthError) {
			error(err.code === 'UNAUTHORIZED' ? 401 : 403, err.message);
		}
		throw err;
	}
};
