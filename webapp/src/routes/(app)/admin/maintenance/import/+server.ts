import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { createGunzip } from 'node:zlib';
import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import { AuthError, requireAdmin } from '$lib/services/auth';
import type { RequestHandler } from './$types';

const MAX_COMPRESSED_BYTES = 100 * 1024 * 1024;
const MAX_SQL_BYTES = 1024 * 1024 * 1024;

function databaseConfig() {
	if (!env.DATABASE_URL) throw new Error('DATABASE_URL missing');
	const url = new URL(env.DATABASE_URL);
	const database = decodeURIComponent(url.pathname.slice(1));
	if (!/^[a-zA-Z0-9_-]+$/.test(database)) throw new Error('Invalid database name');
	return {
		database,
		args: [
			'--no-defaults',
			'--protocol=TCP',
			`--host=${url.hostname}`,
			`--port=${url.port || '3306'}`,
			`--user=${decodeURIComponent(url.username)}`,
			'--default-character-set=utf8mb4',
			'--binary-mode'
		],
		env: { ...process.env, MYSQL_PWD: decodeURIComponent(url.password) }
	};
}

async function runMysql(args: string[], mysqlEnv: NodeJS.ProcessEnv, inputPath?: string) {
	for (const command of ['mysql', 'mariadb']) {
		const child = spawn(command, args, { env: mysqlEnv, stdio: ['pipe', 'ignore', 'pipe'] });
		try {
			await new Promise<void>((resolve, reject) => {
				child.once('spawn', resolve);
				child.once('error', reject);
			});
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
			throw err;
		}

		child.stderr.resume();
		const exit = new Promise<number>((resolve, reject) => {
			child.once('close', (code) => resolve(code ?? -1));
			child.once('error', reject);
		});
		let inputError: unknown;
		if (inputPath) {
			try {
				await pipeline(createReadStream(inputPath), child.stdin);
			} catch (err) {
				inputError = err;
			}
		} else {
			child.stdin.end();
		}
		if ((await exit) !== 0) throw new Error('Database client failed');
		if (inputError) throw inputError;
		return;
	}
	throw new Error('Database client unavailable');
}

async function verifyDumpDatabase(path: string, database: string) {
	const file = await open(path, 'r');
	try {
		const buffer = Buffer.alloc(64 * 1024);
		const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
		const header = buffer.subarray(0, bytesRead).toString('utf8');
		const use = header.match(/^USE `([^`]+)`;\s*$/m);
		if (!use || use[1] !== database || !/^CREATE DATABASE\b/m.test(header)) {
			throw new Error('Backup is not for the configured database');
		}
	} finally {
		await file.close();
	}
}

export const POST: RequestHandler = async ({ locals, request, url }) => {
	try {
		requireAdmin(await locals.verifyAdmin());
	} catch (err) {
		if (err instanceof AuthError) {
			return json(
				{ error: 'Accesso non consentito' },
				{ status: err.code === 'FORBIDDEN' ? 403 : 401 }
			);
		}
		throw err;
	}

	if (
		request.headers.get('origin') !== url.origin ||
		request.headers.get('x-confirm-replace') !== 'SOVRASCRIVI'
	) {
		return json({ error: 'Conferma non valida' }, { status: 403 });
	}
	if (request.headers.get('content-type') !== 'application/gzip' || !request.body) {
		return json({ error: 'Seleziona un backup .sql.gz valido' }, { status: 400 });
	}
	const length = Number(request.headers.get('content-length'));
	if (length > MAX_COMPRESSED_BYTES) {
		return json({ error: 'Il backup supera il limite di 100 MB' }, { status: 413 });
	}

	let config: ReturnType<typeof databaseConfig>;
	try {
		config = databaseConfig();
	} catch {
		return json({ error: 'Importazione non disponibile' }, { status: 500 });
	}

	const directory = await mkdtemp(join(tmpdir(), 'nz-badge-import-'));
	const sqlPath = join(directory, 'backup.sql');
	let replacing = false;
	try {
		let compressedBytes = 0;
		let sqlBytes = 0;
		const compressedLimit = new Transform({
			transform(chunk: Buffer, _encoding, callback) {
				compressedBytes += chunk.length;
				callback(
					compressedBytes <= MAX_COMPRESSED_BYTES ? null : new Error('Backup too large'),
					chunk
				);
			}
		});
		const sqlLimit = new Transform({
			transform(chunk: Buffer, _encoding, callback) {
				sqlBytes += chunk.length;
				callback(sqlBytes <= MAX_SQL_BYTES ? null : new Error('SQL too large'), chunk);
			}
		});
		await pipeline(
			Readable.fromWeb(request.body as unknown as NodeReadableStream),
			compressedLimit,
			createGunzip(),
			sqlLimit,
			createWriteStream(sqlPath, { mode: 0o600 })
		);
		if (sqlBytes === 0) throw new Error('Empty backup');
		await verifyDumpDatabase(sqlPath, config.database);
		await runMysql([...config.args, '--execute', 'SELECT 1;'], config.env);

		// DDL is not transactional in MySQL. The verified archive is ready before this point.
		replacing = true;
		const quoted = `\`${config.database.replaceAll('`', '``')}\``;
		await runMysql([...config.args, '--execute', `DROP DATABASE IF EXISTS ${quoted};`], config.env);
		await runMysql(config.args, config.env, sqlPath);
		return json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
	} catch (err) {
		console.error('[DB IMPORT] Failed:', err instanceof Error ? err.message : 'unknown error');
		return json(
			{
				error: replacing
					? 'Importazione fallita. Il database potrebbe essere incompleto: ripristina un backup valido prima di usare l’app.'
					: 'Backup non valido o non compatibile con questo database. Nessun dato è stato modificato.'
			},
			{ status: replacing ? 500 : 400, headers: { 'Cache-Control': 'no-store' } }
		);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
};
