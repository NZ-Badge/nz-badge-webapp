/**
 * Dump del database con `mysqldump`/`mariadb-dump`, condiviso da:
 * - il download del backup (`admin/maintenance/backup`), che lo invia in streaming;
 * - l'import (`admin/maintenance/import`), che salva un dump di sicurezza su disco
 *   prima del `DROP DATABASE`.
 *
 * La password passa solo via `MYSQL_PWD`, mai negli argomenti del processo.
 */

import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip, type Gzip } from 'node:zlib';

/** Directory di default dei dump di sicurezza: `localfiles/` e' gia' scrivibile (firmware). */
export const DEFAULT_BACKUP_DIR = join('localfiles', 'backups');

export class DatabaseDumpError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'DatabaseDumpError';
	}
}

export interface DatabaseConnectionConfig {
	database: string;
	host: string;
	port: string;
	user: string;
	password: string;
}

export function parseDatabaseUrl(databaseUrl: string | undefined): DatabaseConnectionConfig {
	if (!databaseUrl) throw new DatabaseDumpError('DATABASE_URL missing');
	const url = new URL(databaseUrl);
	if (!url.pathname || url.pathname === '/') throw new DatabaseDumpError('Database name missing');
	return {
		database: decodeURIComponent(url.pathname.slice(1)),
		host: url.hostname,
		port: url.port || '3306',
		user: decodeURIComponent(url.username),
		password: decodeURIComponent(url.password)
	};
}

export function databaseDumpArgs(config: DatabaseConnectionConfig): string[] {
	return [
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
		`--host=${config.host}`,
		`--port=${config.port}`,
		`--user=${config.user}`,
		'--databases',
		config.database
	];
}

export type DatabaseDumpProcess = ChildProcessByStdio<null, Readable, Readable>;

/** Avvia `mysqldump` (o `mariadb-dump` se il primo non e' installato). */
export async function spawnDatabaseDump(
	config: DatabaseConnectionConfig
): Promise<DatabaseDumpProcess> {
	const args = databaseDumpArgs(config);
	for (const command of ['mysqldump', 'mariadb-dump']) {
		const candidate = spawn(command, args, {
			env: { ...process.env, MYSQL_PWD: config.password },
			stdio: ['ignore', 'pipe', 'pipe']
		});
		try {
			await new Promise<void>((resolvePromise, reject) => {
				candidate.once('spawn', resolvePromise);
				candidate.once('error', reject);
			});
			return candidate;
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
				throw new DatabaseDumpError('Database dump unavailable');
			}
		}
	}
	throw new DatabaseDumpError('Database dump unavailable');
}

/**
 * Comprime l'output del dump. Il gzip termina solo quando il processo esce con codice 0,
 * cosi' un dump fallito non puo' sembrare completo.
 */
export function gzipDatabaseDump(dump: DatabaseDumpProcess): Gzip {
	const gzip = createGzip();
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
	return gzip;
}

export function dumpTimestamp(date = new Date()): string {
	return date.toISOString().replace(/[:.]/g, '-');
}

/** Directory dei dump di sicurezza: `DB_BACKUP_DIR` (assoluta o relativa alla cwd). */
export function resolveBackupDir(configured: string | undefined): string {
	const dir = configured?.trim() || DEFAULT_BACKUP_DIR;
	return isAbsolute(dir) ? dir : resolve(process.cwd(), dir);
}

/**
 * Salva un dump compresso completo in `directory` e ne restituisce il percorso.
 * In caso di errore il file parziale viene rimosso e l'errore propagato.
 */
export async function saveDatabaseDump(
	config: DatabaseConnectionConfig,
	directory: string,
	prefix = 'nz-badge-pre-import'
): Promise<string> {
	await mkdir(directory, { recursive: true, mode: 0o700 });
	const path = join(directory, `${prefix}-${dumpTimestamp()}.sql.gz`);

	try {
		const dump = await spawnDatabaseDump(config);
		await pipeline(gzipDatabaseDump(dump), createWriteStream(path, { mode: 0o600, flags: 'wx' }));
		return path;
	} catch (err) {
		await rm(path, { force: true });
		throw err;
	}
}
