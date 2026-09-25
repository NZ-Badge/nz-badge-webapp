import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/db';
import { firmwareReleases } from '$lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { createHash } from 'crypto';
import { requireAdmin, requirePageAdmin } from '$lib/services/auth';
import { logAudit } from '$lib/services/audit';

const FIRMWARE_DIR = join(process.cwd(), 'localfiles', 'firmware', 'reader-station');

export const load: PageServerLoad = async ({ locals }) => {
	// Only admin can access firmware management
	await requirePageAdmin(locals);

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
			const user = await locals.verifyStaffOrAdmin();
			requireAdmin(user);
		} catch {
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

		await mkdir(FIRMWARE_DIR, { recursive: true });
		await writeFile(absPath, buffer);

		try {
			await db.insert(firmwareReleases).values({
				version,
				deviceType: 'reader-station',
				filePath: relPath,
				fileSizeBytes: buffer.length,
				sha256,
				isActive: false,
				releaseNotes: notes || null
			});
		} catch (err) {
			// Non lasciare sul disco un file senza release (es. versione caricata in parallelo)
			await unlink(absPath).catch(() => undefined);
			throw err;
		}

		return { action: 'upload', success: true, version };
	},

	activate: async ({ request, locals }) => {
		// Verify admin
		let userId: number;
		try {
			const user = await locals.verifyStaffOrAdmin();
			requireAdmin(user);
			userId = user.id;
		} catch {
			return fail(401, { action: 'activate', error: 'Non autorizzato' });
		}

		const formData = await request.formData();
		const id = parseInt(formData.get('id') as string, 10);
		if (isNaN(id)) return fail(400, { action: 'activate', error: 'ID non valido' });

		// In un'unica transazione: blocca la release, disattiva tutte quelle dello stesso tipo
		// e attiva quella selezionata, cosi' i device non vedono mai zero o due release attive.
		const activated = await db.transaction(async (tx) => {
			const [release] = await tx
				.select({
					id: firmwareReleases.id,
					version: firmwareReleases.version,
					deviceType: firmwareReleases.deviceType
				})
				.from(firmwareReleases)
				.where(eq(firmwareReleases.id, id))
				.limit(1)
				.for('update');
			if (!release) return null;

			await tx
				.update(firmwareReleases)
				.set({ isActive: false })
				.where(eq(firmwareReleases.deviceType, release.deviceType));

			await tx.update(firmwareReleases).set({ isActive: true }).where(eq(firmwareReleases.id, id));

			await logAudit(
				{
					userId,
					action: 'FIRMWARE_ACTIVATE',
					entityType: 'firmware',
					entityId: release.id,
					dataAfter: { version: release.version, deviceType: release.deviceType }
				},
				tx
			);

			return release;
		});

		if (!activated) return fail(404, { action: 'activate', error: 'Release non trovata' });

		return { action: 'activate', success: true };
	},

	deactivate: async ({ request, locals }) => {
		// Verify admin
		try {
			const user = await locals.verifyStaffOrAdmin();
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
