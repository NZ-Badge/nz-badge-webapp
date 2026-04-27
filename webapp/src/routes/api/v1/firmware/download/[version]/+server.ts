import type { RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/db';
import { firmwareReleases } from '$lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { unauthorized, notFound, serverError } from '$lib/utils/api';
import { AuthError } from '$lib/services/auth';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const FIRMWARE_BASE_DIR = join(process.cwd(), 'localfiles');

export async function GET(event: RequestEvent): Promise<Response> {
	let device;
	try {
		device = await event.locals.verifyDevice();
	} catch (err) {
		return err instanceof AuthError ? unauthorized(err.message) : serverError();
	}

	// Suppress unused variable warning — device is used for auth side-effects
	void device;

	const version = event.params.version!;

	const [release] = await db
		.select()
		.from(firmwareReleases)
		.where(
			and(
				eq(firmwareReleases.version, version),
				eq(firmwareReleases.isActive, true)
			)
		)
		.limit(1);

	if (!release) return notFound('firmware version not found or not active');

	const absolutePath = join(FIRMWARE_BASE_DIR, release.filePath);
	if (!existsSync(absolutePath)) {
		console.error(`[OTA] File not found on disk: ${absolutePath}`);
		return serverError('firmware file not found on server');
	}

	const buffer = readFileSync(absolutePath);

	return new Response(buffer, {
		status: 200,
		headers: {
			'Content-Type':        'application/octet-stream',
			'Content-Length':      buffer.length.toString(),
			'Content-Disposition': `attachment; filename="reader-station-${version}.bin"`,
			'Cache-Control':       'no-store'
		}
	});
}
