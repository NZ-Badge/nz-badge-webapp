/**
 * Users API - Admin-only user management
 * Provides CRUD operations for user accounts
 */

import { db } from '$lib/db';
import { cardRfid, users, type NewUser, type User } from '$lib/db/schema';
import { and, eq, count as countFn } from 'drizzle-orm';
import { hashPassword, requireAdmin, requireStaffManager } from '$lib/services/auth';
import { logAudit } from '$lib/services/audit';
import {
	ok,
	created,
	badRequest,
	forbidden,
	notFound,
	conflict,
	authErrorResponse
} from '$lib/utils/api';
import { z } from 'zod';
import { passwordSchema } from '$lib/utils/validation';
import type { RequestHandler } from './$types';

// Validation schemas
const userCreateSchema = z.object({
	name: z.string().min(1, 'Il nome è obbligatorio').max(100, 'Nome troppo lungo'),
	email: z.string().email('Email non valida').max(255, 'Email troppo lunga'),
	role: z.enum(['admin', 'staff', 'collaborator'], {
		message: 'Il ruolo deve essere admin, staff o collaborator'
	}),
	password: passwordSchema
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
	password: passwordSchema.optional()
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
		const user = await locals.verifyStaffOrAdmin();
		requireStaffManager(user);
	} catch (err) {
		return authErrorResponse(err);
	}

	const allUsers = await db.select().from(users);
	return ok({ users: allUsers.map(sanitizeUser) });
};

/** Legge il body JSON della richiesta; `undefined` se non e' JSON valido. */
async function readJson(request: Request): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		return undefined;
	}
}

/**
 * POST /api/v1/users - Create new user (admin only)
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const user = await locals.verifyStaffOrAdmin();
		requireAdmin(user);
	} catch (err) {
		return authErrorResponse(err);
	}

	const validation = userCreateSchema.safeParse(await readJson(request));
	if (!validation.success) {
		return badRequest('Validazione fallita', validation.error.flatten().fieldErrors);
	}

	const { name, email, role, password } = validation.data;

	// Check if email already exists
	const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);
	if (existingUser) {
		return conflict('Email già esistente');
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

	return created({ user: sanitizeUser(newUser) });
};

/**
 * PATCH /api/v1/users - Update user (admin only)
 * Cannot update self role to prevent locking out the last admin
 */
export const PATCH: RequestHandler = async ({ request, locals }) => {
	let currentUser;
	try {
		currentUser = await locals.verifyStaffOrAdmin();
		requireAdmin(currentUser);
	} catch (err) {
		return authErrorResponse(err);
	}

	const validation = userUpdateSchema.safeParse(await readJson(request));
	if (!validation.success) {
		return badRequest('Validazione fallita', validation.error.flatten().fieldErrors);
	}

	const { id, name, email, role, password } = validation.data;

	// Check if user exists
	const [targetUser] = await db.select().from(users).where(eq(users.id, id)).limit(1);
	if (!targetUser) {
		return notFound('Utente non trovato');
	}
	if (targetUser.status !== 'active') {
		return conflict('Non puoi modificare un utente disattivato');
	}

	// Prevent changing own role (to avoid locking yourself out)
	if (id === currentUser.id && role && role !== currentUser.role) {
		return forbidden('Non puoi modificare il tuo ruolo');
	}

	// Check if updating to an existing email
	if (email && email !== targetUser.email) {
		const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);
		if (existingUser) {
			return conflict('Email già esistente');
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
			return forbidden('Non puoi modificare il ruolo dell’ultimo amministratore');
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
	return ok({ user: sanitizeUser(updatedUser) });
};

/**
 * DELETE /api/v1/users - Delete user (admin only)
 * Cannot delete self or the last admin
 */
export const DELETE: RequestHandler = async ({ request, locals }) => {
	let currentUser;
	try {
		currentUser = await locals.verifyStaffOrAdmin();
		requireAdmin(currentUser);
	} catch (err) {
		return authErrorResponse(err);
	}

	const validation = userIdSchema.safeParse(await readJson(request));
	if (!validation.success) {
		return badRequest('ID utente non valido');
	}

	const { id } = validation.data;

	// Cannot delete self
	if (id === currentUser.id) {
		return forbidden('Non puoi eliminare il tuo account');
	}

	// Check if user exists
	const [targetUser] = await db.select().from(users).where(eq(users.id, id)).limit(1);
	if (!targetUser) {
		return notFound('Utente non trovato');
	}

	// Check if this is the last admin
	if (targetUser.role === 'admin') {
		const adminCount = await db
			.select({ count: countFn() })
			.from(users)
			.where(and(eq(users.role, 'admin'), eq(users.status, 'active')));

		const count = Number(adminCount[0]?.count || 0);
		if (count <= 1) {
			return forbidden('Non puoi eliminare l’ultimo amministratore');
		}
	}

	if (targetUser.status !== 'active') {
		return conflict('L’utente è già disattivato');
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

	return ok({ message: 'Utente disattivato' });
};
