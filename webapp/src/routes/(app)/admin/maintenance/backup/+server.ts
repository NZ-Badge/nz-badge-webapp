import { Readable } from 'node:stream';
import { env } from '$env/dynamic/private';
import { requireAdmin } from '$lib/services/auth';
import { authErrorResponse, serverError } from '$lib/utils/api';
import {
	dumpTimestamp,
	gzipDatabaseDump,
	parseDatabaseUrl,
	spawnDatabaseDump,
	type DatabaseConnectionConfig,
	type DatabaseDumpProcess
} from '$lib/services/database-dump';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, request }) => {
	try {
		requireAdmin(await locals.verifyStaffOrAdmin());
	} catch (err) {
		return authErrorResponse(err);
	}

	let config: DatabaseConnectionConfig;
	try {
		config = parseDatabaseUrl(env.DATABASE_URL);
	} catch {
		return serverError('Backup non disponibile');
	}

	let dump: DatabaseDumpProcess;
	try {
		dump = await spawnDatabaseDump(config);
	} catch {
		return serverError('Backup non disponibile');
	}

	const gzip = gzipDatabaseDump(dump);
	request.signal.addEventListener('abort', () => gzip.destroy(), { once: true });

	return new Response(Readable.toWeb(gzip) as ReadableStream, {
		headers: {
			'Content-Type': 'application/gzip',
			'Content-Disposition': `attachment; filename="nz-badge-db-${dumpTimestamp()}.sql.gz"`,
			'Cache-Control': 'no-store, private',
			'X-Content-Type-Options': 'nosniff'
		}
	});
};
