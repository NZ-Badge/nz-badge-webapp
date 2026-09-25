import type { RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/db';
import { firmwareReleases, deviceRegistry } from '$lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { badRequest, authErrorResponse, rawJson } from '$lib/utils/api';

export async function GET(event: RequestEvent): Promise<Response> {
	let device;
	try {
		device = await event.locals.verifyDevice();
	} catch (err) {
		return authErrorResponse(err);
	}

	const currentVersion = event.url.searchParams.get('version');
	if (!currentVersion) return badRequest('missing version param');

	// Aggiorna versione firmware nel registro device (fire and forget)
	db.update(deviceRegistry)
		.set({ firmwareVersion: currentVersion })
		.where(eq(deviceRegistry.deviceId, device.deviceId))
		.catch(() => {
			/* ignore */
		});

	// Cerca release attiva per reader-station
	const [active] = await db
		.select()
		.from(firmwareReleases)
		.where(
			and(eq(firmwareReleases.deviceType, 'reader-station'), eq(firmwareReleases.isActive, true))
		)
		.limit(1);

	// Contratto device (docs/DEVICE-API.md): risposta senza l'involucro { success, data }.
	if (!active || !isNewerVersion(active.version, currentVersion)) {
		return rawJson({ update_available: false });
	}

	return rawJson({
		update_available: true,
		version: active.version,
		url: `/api/v1/firmware/download/${active.version}`,
		sha256: active.sha256
	});
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
