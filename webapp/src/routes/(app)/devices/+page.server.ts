import { db } from '$lib/db';
import { deviceRegistry } from '$lib/db/schema';
import { eq, desc, like, or } from 'drizzle-orm';
import { fail, error } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import type { PageServerLoad, Actions } from './$types';
import { AuthError, requireAdmin } from '$lib/services/auth';

const ITEMS_PER_PAGE = 20;

export const load: PageServerLoad = async ({ url, locals }) => {
	// Only admin can access device management
	try {
		const user = await locals.verifyAdmin();
		requireAdmin(user);
	} catch (err) {
		if (err instanceof AuthError) {
			if (err.code === 'FORBIDDEN') {
				error(403, 'Admin access required');
			}
			error(401, 'Unauthorized');
		}
		throw err;
	}

	const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
	const q = url.searchParams.get('q')?.trim() ?? '';

	// Build query with conditional where
	const whereClause = q
		? or(like(deviceRegistry.deviceId, `%${q}%`), like(deviceRegistry.location ?? '', `%${q}%`))
		: undefined;

	const allDevices = await db
		.select()
		.from(deviceRegistry)
		.where(whereClause)
		.orderBy(desc(deviceRegistry.createdAt));

	// Pagination
	const total = allDevices.length;
	const totalPages = Math.ceil(total / ITEMS_PER_PAGE);
	const offset = (page - 1) * ITEMS_PER_PAGE;
	const devices = allDevices.slice(offset, offset + ITEMS_PER_PAGE);

	return {
		devices,
		page,
		totalPages,
		total,
		q
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		// Verify admin
		try {
			const user = await locals.verifyAdmin();
			requireAdmin(user);
		} catch (err) {
			return fail(401, { action: 'create', error: 'Non autorizzato' });
		}

		const formData = await request.formData();
		const deviceId = formData.get('deviceId')?.toString().trim();
		const deviceType = formData.get('deviceType')?.toString() as 'reader' | 'writer';
		const location = formData.get('location')?.toString().trim() ?? '';

		// Validation
		if (!deviceId) {
			return fail(400, { action: 'create', error: 'L’ID dispositivo è obbligatorio' });
		}
		if (!/^[a-zA-Z0-9_-]+$/.test(deviceId)) {
			return fail(400, {
				action: 'create',
				error: 'L’ID dispositivo può contenere solo lettere, numeri, underscore e trattini'
			});
		}
		if (!deviceType || (deviceType !== 'reader' && deviceType !== 'writer')) {
			return fail(400, {
				action: 'create',
				error: 'Il tipo dispositivo deve essere reader o writer'
			});
		}

		try {
			// Generate a secure random token (48 chars, URL-safe)
			const token = crypto.randomBytes(36).toString('base64url').slice(0, 48);

			// Hash the token with bcrypt
			const tokenHash = await bcrypt.hash(token, 10);

			// Check if device already exists
			const existing = await db
				.select()
				.from(deviceRegistry)
				.where(eq(deviceRegistry.deviceId, deviceId))
				.limit(1);

			if (existing.length > 0) {
				return fail(400, { action: 'create', error: 'L’ID dispositivo esiste già' });
			}

			// Insert into database
			await db.insert(deviceRegistry).values({
				deviceId,
				deviceType,
				location: location || null,
				tokenHash,
				active: true
			});

			// Return the token (shown only once!)
			return {
				action: 'create',
				success: true,
				deviceId,
				token,
				message: 'Device registered successfully. Copy the token now - it will not be shown again!'
			};
		} catch (err) {
			console.error('Failed to create device:', err);
			return fail(500, { action: 'create', error: 'Impossibile registrare il dispositivo' });
		}
	},

	update: async ({ request, locals }) => {
		// Verify admin
		try {
			const user = await locals.verifyAdmin();
			requireAdmin(user);
		} catch (err) {
			return fail(401, { action: 'update', error: 'Non autorizzato' });
		}

		const formData = await request.formData();
		const id = parseInt(formData.get('id')?.toString() ?? '', 10);
		const location = formData.get('location')?.toString().trim() ?? '';
		const active = formData.get('active')?.toString() === 'true';

		if (isNaN(id)) {
			return fail(400, { action: 'update', error: 'ID dispositivo non valido' });
		}

		try {
			await db
				.update(deviceRegistry)
				.set({
					location: location || null,
					active
				})
				.where(eq(deviceRegistry.id, id));

			return { action: 'update', success: true };
		} catch (err) {
			console.error('Failed to update device:', err);
			return fail(500, { action: 'update', error: 'Impossibile aggiornare il dispositivo' });
		}
	},

	delete: async ({ request, locals }) => {
		// Verify admin
		try {
			const user = await locals.verifyAdmin();
			requireAdmin(user);
		} catch (err) {
			return fail(401, { action: 'delete', error: 'Non autorizzato' });
		}

		const formData = await request.formData();
		const id = parseInt(formData.get('id')?.toString() ?? '', 10);

		if (isNaN(id)) {
			return fail(400, { action: 'delete', error: 'ID dispositivo non valido' });
		}

		try {
			await db.delete(deviceRegistry).where(eq(deviceRegistry.id, id));
			return { action: 'delete', success: true };
		} catch (err) {
			console.error('Failed to delete device:', err);
			return fail(500, { action: 'delete', error: 'Impossibile eliminare il dispositivo' });
		}
	}
};
