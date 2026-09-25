import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { Readable } from 'node:stream';
import { createGzip } from 'node:zlib';
import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import { AuthError, requireAdmin } from '$lib/services/auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, request }) => {
	try {
		requireAdmin(await locals.verifyAdmin());
	} catch (err) {
		if (err instanceof AuthError) {
			error(err.code === 'FORBIDDEN' ? 403 : 401, 'Accesso non consentito');
		}
		throw err;
	}

	if (!env.DATABASE_URL) error(500, 'Backup non disponibile');

	let databaseUrl: URL;
	try {
		databaseUrl = new URL(env.DATABASE_URL);
		if (!databaseUrl.pathname || databaseUrl.pathname === '/') throw new Error();
	} catch {
		error(500, 'Backup non disponibile');
	}

	const database = decodeURIComponent(databaseUrl.pathname.slice(1));
	const args = [
		'--no-defaults',
		'--single-transaction',
		'--quick',
		'--routines',
		'--triggers',
		'--events',
		'--hex-blob',
		'--no-tablespaces',
		'--default-character-set=utf8mb4',
		'--protocol=TCP',
		`--host=${databaseUrl.hostname}`,
		`--port=${databaseUrl.port || '3306'}`,
		`--user=${decodeURIComponent(databaseUrl.username)}`,
		'--databases',
		database
	];
	let dump: ChildProcessByStdio<null, Readable, Readable> | undefined;
	for (const command of ['mysqldump', 'mariadb-dump']) {
		const candidate = spawn(command, args, {
			env: { ...process.env, MYSQL_PWD: decodeURIComponent(databaseUrl.password) },
			stdio: ['ignore', 'pipe', 'pipe']
		});
		try {
			await new Promise<void>((resolve, reject) => {
				candidate.once('spawn', resolve);
				candidate.once('error', reject);
			});
			dump = candidate;
			break;
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== 'ENOENT') error(500, 'Backup non disponibile');
		}
	}
	if (!dump) error(500, 'Backup non disponibile');

	const gzip = createGzip();
	// Wait for the process exit before ending gzip, so a failed dump cannot look complete.
	dump.stdout.pipe(gzip, { end: false });
	dump.stderr.resume();
	dump.once('close', (code) => {
		if (code === 0) gzip.end();
		else gzip.destroy(new Error('Database dump failed'));
	});
	dump.stdout.once('error', (err) => gzip.destroy(err));
	gzip.once('close', () => {
		if (dump.exitCode === null) dump.kill();
	});
	request.signal.addEventListener('abort', () => gzip.destroy(), { once: true });

	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	return new Response(Readable.toWeb(gzip) as ReadableStream, {
		headers: {
			'Content-Type': 'application/gzip',
			'Content-Disposition': `attachment; filename="nz-badge-db-${timestamp}.sql.gz"`,
			'Cache-Control': 'no-store, private',
			'X-Content-Type-Options': 'nosniff'
		}
	});
};
