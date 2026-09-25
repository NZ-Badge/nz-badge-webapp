/**
 * Users API - Admin-only user management.
 * The rules (last admin, own role, duplicate email) and the audit live in `$lib/services/users`.
 */

import { requireAdmin, requireStaffManager } from '$lib/services/auth';
import { createUser, deactivateUser, listUsers, updateUser } from '$lib/services/users';
import { ok, created, authErrorResponse } from '$lib/utils/api';
import { userErrorResponse } from './errors';
import type { RequestHandler } from './$types';

/** Legge il body JSON della richiesta; `undefined` se non e' JSON valido. */
async function readJson(request: Request): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		return undefined;
	}
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

	return ok({ users: await listUsers() });
};

/**
 * POST /api/v1/users - Create new user (admin only)
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	let currentUser;
	try {
		currentUser = await locals.verifyStaffOrAdmin();
		requireAdmin(currentUser);
	} catch (err) {
		return authErrorResponse(err);
	}

	try {
		return created({ user: await createUser(await readJson(request), currentUser) });
	} catch (err) {
		return userErrorResponse(err);
	}
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

	try {
		return ok({ user: await updateUser(await readJson(request), currentUser) });
	} catch (err) {
		return userErrorResponse(err);
	}
};

/**
 * DELETE /api/v1/users - Deactivate user (admin only)
 * Cannot deactivate self or the last admin
 */
export const DELETE: RequestHandler = async ({ request, locals }) => {
	let currentUser;
	try {
		currentUser = await locals.verifyStaffOrAdmin();
		requireAdmin(currentUser);
	} catch (err) {
		return authErrorResponse(err);
	}

	const body = await readJson(request);
	const id = body && typeof body === 'object' && 'id' in body ? body.id : undefined;
	try {
		await deactivateUser(id, currentUser);
		return ok({ message: 'Utente disattivato' });
	} catch (err) {
		return userErrorResponse(err);
	}
};
