import type { PageServerLoad, Actions } from './$types';
import { fail, error } from '@sveltejs/kit';
import { db } from '$lib/db';
import { firmwareReleases } from '$lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { AuthError, requireAdmin } from '$lib/services/auth';

const FIRMWARE_DIR = join(process.cwd(), 'localfiles', 'firmware', 'reader-station');

export const load: PageServerLoad = async ({ locals }) => {
	// Only admin can access firmware management
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

	const releases = await db
		.select()
		.from(firmwareReleases)
		.orderBy(desc(firmwareReleases.createdAt));

	return { releases };
};

export const actions: Actions = {
	upload: async ({ request, locals }) => {
		// Verify admin
		try {
			const user = await locals.verifyAdmin();
			requireAdmin(user);
		} catch (err) {
			return fail(401, { action: 'upload', error: 'Non autorizzato' });
		}

		const formData = await request.formData();
		const version = (formData.get('version') as string)?.trim();
		const notes = (formData.get('notes') as string) ?? '';
		const file = formData.get('file') as File;

		if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
			return fail(400, { action: 'upload', error: 'Versione non valida (formato: X.Y.Z)' });
		}
		if (!file || file.size === 0) {
			return fail(400, { action: 'upload', error: 'File .bin obbligatorio' });
		}
		if (!file.name.endsWith('.bin')) {
			return fail(400, { action: 'upload', error: 'Il file deve essere un .bin' });
		}

		// Check duplicate version
		const [existing] = await db
			.select({ id: firmwareReleases.id })
			.from(firmwareReleases)
			.where(eq(firmwareReleases.version, version))
			.limit(1);

		if (existing) {
			return fail(400, { action: 'upload', error: `Versione ${version} già esistente` });
		}

		const buffer = Buffer.from(await file.arrayBuffer());
		const sha256 = createHash('sha256').update(buffer).digest('hex');
		const relPath = `firmware/reader-station/${version}.bin`;
		const absPath = join(process.cwd(), 'localfiles', relPath);

		mkdirSync(FIRMWARE_DIR, { recursive: true });
		writeFileSync(absPath, buffer);

		await db.insert(firmwareReleases).values({
			version,
			deviceType: 'reader-station',
			filePath: relPath,
			fileSizeBytes: buffer.length,
			sha256,
			isActive: false,
			releaseNotes: notes || null
		});

		return { action: 'upload', success: true, version };
	},

	activate: async ({ request, locals }) => {
		// Verify admin
		try {
			const user = await locals.verifyAdmin();
			requireAdmin(user);
		} catch {
			return fail(401, { action: 'activate', error: 'Non autorizzato' });
		}

		const formData = await request.formData();
		const id = parseInt(formData.get('id') as string, 10);
		if (isNaN(id)) return fail(400, { action: 'activate', error: 'ID non valido' });

		// Disattiva tutte le release reader-station, poi attiva quella selezionata
		await db
			.update(firmwareReleases)
			.set({ isActive: false })
			.where(eq(firmwareReleases.deviceType, 'reader-station'));

		await db.update(firmwareReleases).set({ isActive: true }).where(eq(firmwareReleases.id, id));

		return { action: 'activate', success: true };
	},

	deactivate: async ({ request, locals }) => {
		// Verify admin
		try {
			const user = await locals.verifyAdmin();
			requireAdmin(user);
		} catch {
			return fail(401, { action: 'deactivate', error: 'Non autorizzato' });
		}

		const formData = await request.formData();
		const id = parseInt(formData.get('id') as string, 10);
		if (isNaN(id)) return fail(400, { action: 'deactivate', error: 'ID non valido' });

		await db.update(firmwareReleases).set({ isActive: false }).where(eq(firmwareReleases.id, id));

		return { action: 'deactivate', success: true };
	}
};
