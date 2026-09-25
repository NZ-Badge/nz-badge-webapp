import type { RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/db';
import { firmwareReleases } from '$lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { unauthorized, notFound, serverError } from '$lib/utils/api';
import { AuthError } from '$lib/services/auth';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { join } from 'path';
import { Readable } from 'stream';

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
		console.error(`[OTA] File not found on disk: ${absolutePath}`);
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
