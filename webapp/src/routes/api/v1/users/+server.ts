/**
 * Users API - Admin-only user management
 * Provides CRUD operations for user accounts
 */

import { json, error } from '@sveltejs/kit';
import { db } from '$lib/db';
import { cardRfid, users, type NewUser, type User } from '$lib/db/schema';
import { and, eq, count as countFn } from 'drizzle-orm';
import { hashPassword, requireAdmin, requireStaffManager, AuthError } from '$lib/services/auth';
import { logAudit } from '$lib/services/audit';
import { z } from 'zod';
import type { RequestHandler } from './$types';

// Validation schemas
const userCreateSchema = z.object({
	name: z.string().min(1, 'Il nome è obbligatorio').max(100, 'Nome troppo lungo'),
	email: z.string().email('Email non valida').max(255, 'Email troppo lunga'),
	role: z.enum(['admin', 'staff', 'collaborator'], {
		message: 'Il ruolo deve essere admin, staff o collaborator'
	}),
	password: z
		.string()
		.min(8, 'La password deve contenere almeno 8 caratteri')
		.max(100, 'Password troppo lunga')
});

const userUpdateSchema = z.object({
	id: z.number(),
	name: z.string().min(1, 'Il nome è obbligatorio').max(100, 'Nome troppo lungo').optional(),
	email: z.string().email('Email non valida').max(255, 'Email troppo lunga').optional(),
	role: z
		.enum(['admin', 'staff', 'collaborator'], {
			message: 'Il ruolo deve essere admin, staff o collaborator'
		})
		.optional(),
	password: z
		.string()
		.min(8, 'La password deve contenere almeno 8 caratteri')
		.max(100, 'Password troppo lunga')
		.optional()
});

const userIdSchema = z.object({
	id: z.number()
});

// Sanitize user object for response (remove password hash)
function sanitizeUser(user: User) {
	const { passwordHash, ...sanitized } = user;
	void passwordHash;
	return sanitized;
}

/**
 * GET /api/v1/users - List all users (admin/operator)
 */
export const GET: RequestHandler = async ({ locals }) => {
	try {
		const user = await locals.verifyAdmin();
		requireStaffManager(user);

		const allUsers = await db.select().from(users);
		return json({ users: allUsers.map(sanitizeUser) });
	} catch (err) {
		if (err instanceof AuthError) {
			error(err.code === 'UNAUTHORIZED' ? 401 : 403, err.message);
		}
		throw err;
	}
};

/**
 * POST /api/v1/users - Create new user (admin only)
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const user = await locals.verifyAdmin();
		requireAdmin(user);

		const body = await request.json();
		const validation = userCreateSchema.safeParse(body);

		if (!validation.success) {
			return json(
				{ error: 'Validazione fallita', details: validation.error.flatten().fieldErrors },
				{ status: 400 }
			);
		}

		const { name, email, role, password } = validation.data;

		// Check if email already exists
		const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);
		if (existingUser) {
			return json({ error: 'Email già esistente' }, { status: 409 });
		}

		// Hash password
		const passwordHash = await hashPassword(password);

		// Create user
		const result = await db.insert(users).values({
			name,
			email,
			role,
			status: 'active',
			passwordHash
		});

		const newUserId = Number(result[0].insertId);
		const [newUser] = await db.select().from(users).where(eq(users.id, newUserId)).limit(1);

		return json({ user: sanitizeUser(newUser) }, { status: 201 });
	} catch (err) {
		if (err instanceof AuthError) {
			error(err.code === 'UNAUTHORIZED' ? 401 : 403, err.message);
		}
		throw err;
	}
};

/**
 * PATCH /api/v1/users - Update user (admin only)
 * Cannot update self role to prevent locking out the last admin
 */
export const PATCH: RequestHandler = async ({ request, locals }) => {
	try {
		const currentUser = await locals.verifyAdmin();
		requireAdmin(currentUser);

		const body = await request.json();
		const validation = userUpdateSchema.safeParse(body);

		if (!validation.success) {
			return json(
				{ error: 'Validazione fallita', details: validation.error.flatten().fieldErrors },
				{ status: 400 }
			);
		}

		const { id, name, email, role, password } = validation.data;

		// Check if user exists
		const [targetUser] = await db.select().from(users).where(eq(users.id, id)).limit(1);
		if (!targetUser) {
			return json({ error: 'Utente non trovato' }, { status: 404 });
		}
		if (targetUser.status !== 'active') {
			return json({ error: 'Non puoi modificare un utente disattivato' }, { status: 409 });
		}

		// Prevent changing own role (to avoid locking yourself out)
		if (id === currentUser.id && role && role !== currentUser.role) {
			return json({ error: 'Non puoi modificare il tuo ruolo' }, { status: 403 });
		}

		// Check if updating to an existing email
		if (email && email !== targetUser.email) {
			const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);
			if (existingUser) {
				return json({ error: 'Email già esistente' }, { status: 409 });
			}
		}

		// Check if this is the last admin and trying to change role
		if (role && role !== 'admin' && targetUser.role === 'admin') {
			const adminCount = await db
				.select({ count: countFn() })
				.from(users)
				.where(and(eq(users.role, 'admin'), eq(users.status, 'active')));

			const count = Number(adminCount[0]?.count || 0);
			if (count <= 1) {
				return json(
					{ error: 'Non puoi modificare il ruolo dell’ultimo amministratore' },
					{ status: 403 }
				);
			}
		}

		// Build update object
		const updateData: Partial<NewUser> = {};
		if (name !== undefined) updateData.name = name;
		if (email !== undefined) updateData.email = email;
		if (role !== undefined) updateData.role = role;
		if (password !== undefined) {
			updateData.passwordHash = await hashPassword(password);
		}

		// Update user
		await db.update(users).set(updateData).where(eq(users.id, id));

		const [updatedUser] = await db.select().from(users).where(eq(users.id, id)).limit(1);
		return json({ user: sanitizeUser(updatedUser) });
	} catch (err) {
		if (err instanceof AuthError) {
			error(err.code === 'UNAUTHORIZED' ? 401 : 403, err.message);
		}
		throw err;
	}
};

/**
 * DELETE /api/v1/users - Delete user (admin only)
 * Cannot delete self or the last admin
 */
export const DELETE: RequestHandler = async ({ request, locals }) => {
	try {
		const currentUser = await locals.verifyAdmin();
		requireAdmin(currentUser);

		const body = await request.json();
		const validation = userIdSchema.safeParse(body);

		if (!validation.success) {
			return json({ error: 'ID utente non valido' }, { status: 400 });
		}

		const { id } = validation.data;

		// Cannot delete self
		if (id === currentUser.id) {
			return json({ error: 'Non puoi eliminare il tuo account' }, { status: 403 });
		}

		// Check if user exists
		const [targetUser] = await db.select().from(users).where(eq(users.id, id)).limit(1);
		if (!targetUser) {
			return json({ error: 'Utente non trovato' }, { status: 404 });
		}

		// Check if this is the last admin
		if (targetUser.role === 'admin') {
			const adminCount = await db
				.select({ count: countFn() })
				.from(users)
				.where(and(eq(users.role, 'admin'), eq(users.status, 'active')));

			const count = Number(adminCount[0]?.count || 0);
			if (count <= 1) {
				return json({ error: 'Non puoi eliminare l’ultimo amministratore' }, { status: 403 });
			}
		}

		if (targetUser.status !== 'active') {
			return json({ error: 'L’utente è già disattivato' }, { status: 409 });
		}

		await db.transaction(async (tx) => {
			await tx
				.update(users)
				.set({ status: 'deleted', deletedAt: new Date() })
				.where(eq(users.id, id));
			await tx
				.update(cardRfid)
				.set({ status: 'disabled' })
				.where(and(eq(cardRfid.userId, id), eq(cardRfid.status, 'active')));
		});

		await logAudit({
			userId: currentUser.id,
			action: 'DELETE',
			entityType: 'user',
			entityId: id,
			dataBefore: { status: targetUser.status, role: targetUser.role },
			dataAfter: { status: 'deleted', deletedAt: new Date().toISOString() }
		});

		return json({ success: true, message: 'Utente disattivato' });
	} catch (err) {
		if (err instanceof AuthError) {
			error(err.code === 'UNAUTHORIZED' ? 401 : 403, err.message);
		}
		throw err;
	}
};
