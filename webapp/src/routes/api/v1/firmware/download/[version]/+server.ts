import type { RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/db';
import { firmwareReleases } from '$lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { authErrorResponse, notFound, serverError } from '$lib/utils/api';
import { createLogger } from '$lib/server/logger';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { join } from 'path';
import { Readable } from 'stream';

const FIRMWARE_BASE_DIR = join(process.cwd(), 'localfiles');
const log = createLogger('api/firmware/download');

export async function GET(event: RequestEvent): Promise<Response> {
	try {
		await event.locals.verifyDevice();
	} catch (err) {
		// 401 for bad credentials, 429 (Retry-After: 60) when the device auth rate limit trips.
		return authErrorResponse(err);
	}

	const version = event.params.version!;

	const [release] = await db
		.select()
		.from(firmwareReleases)
		.where(and(eq(firmwareReleases.version, version), eq(firmwareReleases.isActive, true)))
		.limit(1);

	if (!release) return notFound('firmware version not found or not active');

	const absolutePath = join(FIRMWARE_BASE_DIR, release.filePath);
	let size: number;
	try {
		const info = await stat(absolutePath);
		if (!info.isFile()) throw new Error('not a regular file');
		size = info.size;
	} catch {
		log.error('Firmware file not found on disk', { version, filePath: release.filePath });
		return serverError('firmware file not found on server');
	}

	// Stream the binary instead of buffering it: same headers and bytes as before.
	const body = Readable.toWeb(createReadStream(absolutePath)) as ReadableStream<Uint8Array>;

	return new Response(body, {
		status: 200,
		headers: {
			'Content-Type': 'application/octet-stream',
			'Content-Length': size.toString(),
			'Content-Disposition': `attachment; filename="reader-station-${version}.bin"`,
			'Cache-Control': 'no-store'
		}
	});
}
