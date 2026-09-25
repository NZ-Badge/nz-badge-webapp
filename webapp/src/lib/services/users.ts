/**
 * Staff account management shared by the admin pages and the REST API.
 *
 * Accounts are never hard-deleted: `deactivateUser` sets `status = 'deleted'` and disables
 * the account's active cards; `reactivateUser` restores the account but not the cards.
 * Guard rails: nobody can change their own role or deactivate themselves, and the last
 * active administrator can neither be demoted nor deactivated.
 */

import { and, count, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '$lib/db';
import { cardRfid, users, type NewUser, type User } from '$lib/db/schema';
import { hashPassword } from '$lib/services/auth';
import { logAudit } from '$lib/services/audit';
import { passwordSchema } from '$lib/utils/validation';

export class UserServiceError extends Error {
	constructor(
		message: string,
		public readonly code: 'VALIDATION_ERROR' | 'NOT_FOUND' | 'CONFLICT' | 'FORBIDDEN',
		/** Primo messaggio zod per campo (`flatten().fieldErrors`). */
		public readonly fieldErrors?: Record<string, string[] | undefined>
	) {
		super(message);
		this.name = 'UserServiceError';
	}

	/** Codice HTTP corrispondente, usato da API e form action. */
	get status(): 400 | 403 | 404 | 409 {
		switch (this.code) {
			case 'VALIDATION_ERROR':
				return 400;
			case 'FORBIDDEN':
				return 403;
			case 'NOT_FOUND':
				return 404;
			case 'CONFLICT':
				return 409;
		}
	}
}

const roleSchema = z.enum(['admin', 'staff', 'collaborator'], {
	message: 'Il ruolo deve essere admin, staff o collaborator'
});
const nameSchema = z.string().trim().min(1, 'Il nome è obbligatorio').max(100, 'Nome troppo lungo');
const emailSchema = z.string().trim().email('Email non valida').max(255, 'Email troppo lunga');

export const userCreateSchema = z.object({
	name: nameSchema,
	email: emailSchema,
	role: roleSchema,
	password: passwordSchema
});

export const userUpdateSchema = z.object({
	id: z.number().int().positive(),
	name: nameSchema.optional(),
	email: emailSchema.optional(),
	role: roleSchema.optional(),
	password: passwordSchema.optional()
});

export const userIdSchema = z.number().int().positive();

export type UserCreateInput = z.input<typeof userCreateSchema>;
export type UserUpdateInput = z.input<typeof userUpdateSchema>;

/** Account without the password hash, safe to return to the client. */
export type PublicUser = Omit<User, 'passwordHash'>;

type Actor = Pick<User, 'id' | 'role'>;

export function sanitizeUser(user: User): PublicUser {
	const { passwordHash, ...sanitized } = user;
	void passwordHash;
	return sanitized;
}

function parse<T>(schema: z.ZodType<T>, input: unknown, message = 'Validazione fallita'): T {
	const result = schema.safeParse(input);
	if (!result.success) {
		throw new UserServiceError(
			message,
			'VALIDATION_ERROR',
			result.error.flatten().fieldErrors as Record<string, string[] | undefined>
		);
	}
	return result.data;
}

function parseId(id: unknown): number {
	const result = userIdSchema.safeParse(id);
	if (!result.success) throw new UserServiceError('ID utente non valido', 'VALIDATION_ERROR');
	return result.data;
}

async function findUser(id: number): Promise<User | undefined> {
	const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
	return user;
}

async function requireUser(id: number): Promise<User> {
	const user = await findUser(id);
	if (!user) throw new UserServiceError('Utente non trovato', 'NOT_FOUND');
	return user;
}

async function emailTaken(email: string): Promise<boolean> {
	const [existing] = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, email))
		.limit(1);
	return Boolean(existing);
}

async function isLastActiveAdmin(): Promise<boolean> {
	const [row] = await db
		.select({ count: count() })
		.from(users)
		.where(and(eq(users.role, 'admin'), eq(users.status, 'active')));
	return Number(row?.count ?? 0) <= 1;
}

export async function listUsers(): Promise<PublicUser[]> {
	const rows = await db.select().from(users);
	return rows.map(sanitizeUser);
}

export async function createUser(input: unknown, actor: Actor): Promise<PublicUser> {
	const { name, email, role, password } = parse(userCreateSchema, input);

	if (await emailTaken(email)) throw new UserServiceError('Email già esistente', 'CONFLICT');

	const passwordHash = await hashPassword(password);
	const result = await db.insert(users).values({
		name,
		email,
		role,
		status: 'active',
		passwordHash
	});
	const id = Number(result[0].insertId);

	await logAudit({
		userId: actor.id,
		action: 'CREATE',
		entityType: 'user',
		entityId: id,
		dataAfter: { name, role, status: 'active' }
	});

	return sanitizeUser(await requireUser(id));
}

export async function updateUser(input: unknown, actor: Actor): Promise<PublicUser> {
	const { id, name, email, role, password } = parse(userUpdateSchema, input);

	const target = await requireUser(id);
	if (target.status !== 'active') {
		throw new UserServiceError('Non puoi modificare un utente disattivato', 'CONFLICT');
	}
	if (id === actor.id && role && role !== actor.role) {
		throw new UserServiceError('Non puoi modificare il tuo ruolo', 'FORBIDDEN');
	}
	if (email && email !== target.email && (await emailTaken(email))) {
		throw new UserServiceError('Email già esistente', 'CONFLICT');
	}
	if (role && role !== 'admin' && target.role === 'admin' && (await isLastActiveAdmin())) {
		throw new UserServiceError(
			'Non puoi modificare il ruolo dell’ultimo amministratore',
			'FORBIDDEN'
		);
	}

	const changes: Partial<NewUser> = {};
	if (name !== undefined) changes.name = name;
	if (email !== undefined) changes.email = email;
	if (role !== undefined) changes.role = role;
	if (password !== undefined) changes.passwordHash = await hashPassword(password);

	if (Object.keys(changes).length > 0) {
		await db.update(users).set(changes).where(eq(users.id, id));
		await logAudit({
			userId: actor.id,
			action: 'UPDATE',
			entityType: 'user',
			entityId: id,
			dataBefore: { name: target.name, role: target.role },
			dataAfter: {
				...(name !== undefined && { name }),
				...(role !== undefined && { role }),
				...(email !== undefined && { emailChanged: email !== target.email }),
				...(password !== undefined && { passwordChanged: true })
			}
		});
	}

	return sanitizeUser(await requireUser(id));
}

export async function deactivateUser(userId: unknown, actor: Actor): Promise<void> {
	const id = parseId(userId);

	if (id === actor.id) {
		throw new UserServiceError('Non puoi eliminare il tuo account', 'FORBIDDEN');
	}
	const target = await requireUser(id);
	if (target.role === 'admin' && (await isLastActiveAdmin())) {
		throw new UserServiceError('Non puoi eliminare l’ultimo amministratore', 'FORBIDDEN');
	}
	if (target.status !== 'active') {
		throw new UserServiceError('L’utente è già disattivato', 'CONFLICT');
	}

	const deletedAt = new Date();
	await db.transaction(async (tx) => {
		await tx.update(users).set({ status: 'deleted', deletedAt }).where(eq(users.id, id));
		await tx
			.update(cardRfid)
			.set({ status: 'disabled' })
			.where(and(eq(cardRfid.userId, id), eq(cardRfid.status, 'active')));
	});

	await logAudit({
		userId: actor.id,
		action: 'DELETE',
		entityType: 'user',
		entityId: id,
		dataBefore: { status: target.status, role: target.role },
		dataAfter: { status: 'deleted', deletedAt: deletedAt.toISOString() }
	});
}

/** Riattiva un account disattivato; le card disabilitate restano tali. */
export async function reactivateUser(userId: unknown, actor: Actor): Promise<PublicUser> {
	const id = parseId(userId);

	const target = await requireUser(id);
	if (target.status !== 'deleted') {
		throw new UserServiceError('L’utente è già attivo', 'CONFLICT');
	}

	await db.update(users).set({ status: 'active', deletedAt: null }).where(eq(users.id, id));

	await logAudit({
		userId: actor.id,
		action: 'UPDATE',
		entityType: 'user',
		entityId: id,
		dataBefore: { status: target.status, deletedAt: target.deletedAt },
		dataAfter: { status: 'active', deletedAt: null }
	});

	return sanitizeUser(await requireUser(id));
}
