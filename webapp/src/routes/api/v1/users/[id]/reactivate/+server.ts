import { eq } from 'drizzle-orm';
import { db } from '$lib/db';
import { users, type User } from '$lib/db/schema';
import { requireAdmin } from '$lib/services/auth';
import { logAudit } from '$lib/services/audit';
import { ok, badRequest, notFound, conflict, authErrorResponse } from '$lib/utils/api';
import type { RequestHandler } from './$types';

function sanitizeUser(user: User) {
	const { passwordHash, ...sanitized } = user;
	void passwordHash;
	return sanitized;
}

/** POST /api/v1/users/:id/reactivate - Reactivate a disabled user account (admin only). */
export const POST: RequestHandler = async ({ params, locals }) => {
	let currentUser;
	try {
		currentUser = await locals.verifyStaffOrAdmin();
		requireAdmin(currentUser);
	} catch (err) {
		return authErrorResponse(err);
	}

	const id = Number(params.id);
	if (!Number.isInteger(id) || id <= 0) {
		return badRequest('ID utente non valido');
	}

	const [targetUser] = await db.select().from(users).where(eq(users.id, id)).limit(1);
	if (!targetUser) {
		return notFound('Utente non trovato');
	}
	if (targetUser.status !== 'deleted') {
		return conflict('L’utente è già attivo');
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
	return ok({ user: sanitizeUser(reactivatedUser) });
};
