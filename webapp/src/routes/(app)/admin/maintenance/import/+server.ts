import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { createGunzip } from 'node:zlib';
import { env } from '$env/dynamic/private';
import { requireAdmin } from '$lib/services/auth';
import { invalidateSettingsCache } from '$lib/services/settings';
import { logAudit } from '$lib/services/audit';
import {
	parseDatabaseUrl,
	pruneDatabaseDumps,
	resolveBackupDir,
	resolveBackupKeep,
	saveDatabaseDump
} from '$lib/services/database-dump';
import {
	badRequest,
	conflict,
	forbidden,
	noStore,
	ok,
	payloadTooLarge,
	serverError,
	withAuth
} from '$lib/utils/api';
import { createLogger } from '$lib/server/logger';
import type { RequestHandler } from './$types';

const log = createLogger('admin/maintenance/import');

const MAX_COMPRESSED_BYTES = 100 * 1024 * 1024;
const MAX_SQL_BYTES = 1024 * 1024 * 1024;

// Un solo import alla volta per processo: due DROP/import sovrapposti lascerebbero il
// database in uno stato indefinito. (Con piu' repliche serve comunque un lock condiviso.)
let importInProgress = false;

function databaseConfig() {
	const connection = parseDatabaseUrl(env.DATABASE_URL);
	const database = connection.database;
	if (!/^[a-zA-Z0-9_-]+$/.test(database)) throw new Error('Invalid database name');
	return {
		database,
		connection,
		args: [
			'--no-defaults',
			'--protocol=TCP',
			`--host=${connection.host}`,
			`--port=${connection.port}`,
			`--user=${connection.user}`,
			'--default-character-set=utf8mb4',
			'--binary-mode'
		],
		env: { ...process.env, MYSQL_PWD: connection.password }
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
	const user = await withAuth(async () => {
		const current = await locals.verifyStaffOrAdmin();
		requireAdmin(current);
		return current;
	});
	if (user instanceof Response) return user;

	if (
		request.headers.get('origin') !== url.origin ||
		request.headers.get('x-confirm-replace') !== 'SOVRASCRIVI'
	) {
		return forbidden('Conferma non valida');
	}
	if (request.headers.get('content-type') !== 'application/gzip' || !request.body) {
		return badRequest('Seleziona un backup .sql.gz valido');
	}
	const length = Number(request.headers.get('content-length'));
	if (length > MAX_COMPRESSED_BYTES) {
		return payloadTooLarge('Il backup supera il limite di 100 MB');
	}

	let config: ReturnType<typeof databaseConfig>;
	try {
		config = databaseConfig();
	} catch {
		return serverError('Importazione non disponibile');
	}

	if (importInProgress) {
		return noStore(
			conflict('Un’importazione è già in corso. Attendi che termini prima di riprovare.')
		);
	}
	importInProgress = true;
	try {
		return await importBackup(config, request.body, user.id);
	} finally {
		importInProgress = false;
	}
};

async function importBackup(
	config: ReturnType<typeof databaseConfig>,
	body: ReadableStream<Uint8Array>,
	userId: number | undefined
): Promise<Response> {
	const directory = await mkdtemp(join(tmpdir(), 'nz-badge-import-'));
	const sqlPath = join(directory, 'backup.sql');
	let replacing = false;
	let safetyBackupPath: string | null = null;
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
			Readable.fromWeb(body as unknown as NodeReadableStream),
			compressedLimit,
			createGunzip(),
			sqlLimit,
			createWriteStream(sqlPath, { mode: 0o600 })
		);
		if (sqlBytes === 0) throw new Error('Empty backup');
		await verifyDumpDatabase(sqlPath, config.database);
		await runMysql([...config.args, '--execute', 'SELECT 1;'], config.env);

		// Safety dump of the current database: without it the import does not go ahead.
		const backupDir = resolveBackupDir(env.DB_BACKUP_DIR);
		try {
			safetyBackupPath = await saveDatabaseDump(config.connection, backupDir);
		} catch (err) {
			log.error('Safety backup failed', { err });
			return noStore(
				serverError(
					'Impossibile creare il backup di sicurezza del database attuale. Nessun dato è stato modificato.'
				)
			);
		}
		// Retention: keep only the newest DB_BACKUP_KEEP safety dumps (never the one just made).
		await pruneDatabaseDumps(backupDir, resolveBackupKeep(env.DB_BACKUP_KEEP)).catch(
			(err: unknown) => log.warn('Pruning old safety backups failed', { err })
		);

		// DDL is not transactional in MySQL. The verified archive is ready before this point.
		replacing = true;
		const quoted = `\`${config.database.replaceAll('`', '``')}\``;
		await runMysql([...config.args, '--execute', `DROP DATABASE IF EXISTS ${quoted};`], config.env);
		await runMysql(config.args, config.env, sqlPath);
		invalidateSettingsCache();
		// Written after the import, so the entry lives in the restored audit_log.
		await logImportAudit(userId, true, safetyBackupPath);
		return noStore(ok({ imported: true }));
	} catch (err) {
		log.error('Database import failed', { err, replacing });
		if (replacing) {
			await logImportAudit(userId, false, safetyBackupPath);
			return noStore(
				serverError(
					'Importazione fallita. Il database potrebbe essere incompleto: ripristina un backup valido prima di usare l’app.'
				)
			);
		}
		return noStore(
			badRequest(
				'Backup non valido o non compatibile con questo database. Nessun dato è stato modificato.'
			)
		);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

async function logImportAudit(
	userId: number | undefined,
	success: boolean,
	safetyBackupPath: string | null
): Promise<void> {
	await logAudit({
		userId,
		action: 'DB_IMPORT',
		entityType: 'database',
		dataAfter: {
			success,
			safetyBackupFile: safetyBackupPath ? basename(safetyBackupPath) : null
		}
	});
}
