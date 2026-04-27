import type { RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/db';
import { firmwareReleases, deviceRegistry } from '$lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { badRequest, unauthorized, serverError } from '$lib/utils/api';
import { AuthError } from '$lib/services/auth';

export async function GET(event: RequestEvent): Promise<Response> {
	let device;
	try {
		device = await event.locals.verifyDevice();
	} catch (err) {
		return err instanceof AuthError ? unauthorized(err.message) : serverError();
	}

	const currentVersion = event.url.searchParams.get('version');
	if (!currentVersion) return badRequest('missing version param');

	// Aggiorna versione firmware nel registro device (fire and forget)
	db.update(deviceRegistry)
		.set({ firmwareVersion: currentVersion })
		.where(eq(deviceRegistry.deviceId, device.deviceId))
		.catch(() => { /* ignore */ });

	// Cerca release attiva per reader-station
	const [active] = await db
		.select()
		.from(firmwareReleases)
		.where(
			and(
				eq(firmwareReleases.deviceType, 'reader-station'),
				eq(firmwareReleases.isActive, true)
			)
		)
		.limit(1);

	if (!active || !isNewerVersion(active.version, currentVersion)) {
		return new Response(JSON.stringify({ update_available: false }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	return new Response(
		JSON.stringify({
			update_available: true,
			version: active.version,
			url: `/api/v1/firmware/download/${active.version}`,
			sha256: active.sha256
		}),
		{
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		}
	);
}

// Confronto semver MAJOR.MINOR.PATCH — senza dipendenze esterne
function isNewerVersion(candidate: string, current: string): boolean {
	const parse = (v: string) => v.split('.').map(Number);
	const [cMaj, cMin, cPat] = parse(candidate);
	const [rMaj, rMin, rPat] = parse(current);
	if (cMaj !== rMaj) return cMaj > rMaj;
	if (cMin !== rMin) return cMin > rMin;
	return cPat > rPat;
}
