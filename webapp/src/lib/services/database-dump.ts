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
import { mkdir, readdir, rm } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip, type Gzip } from 'node:zlib';

/** Directory di default dei dump di sicurezza: `localfiles/` e' gia' scrivibile (firmware). */
export const DEFAULT_BACKUP_DIR = join('localfiles', 'backups');
/** Numero di dump di sicurezza conservati se `DB_BACKUP_KEEP` non e' impostata. */
export const DEFAULT_BACKUP_KEEP = 10;
/** Prefisso dei dump di sicurezza creati prima di un import. */
export const PRE_IMPORT_DUMP_PREFIX = 'nz-badge-pre-import';

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
	prefix = PRE_IMPORT_DUMP_PREFIX
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

/** `DB_BACKUP_KEEP` come intero positivo; valori assenti o non validi usano il default. */
export function resolveBackupKeep(configured: string | undefined): number {
	const value = Number(configured?.trim());
	return Number.isInteger(value) && value >= 1 ? value : DEFAULT_BACKUP_KEEP;
}

/**
 * Conserva solo gli ultimi `keep` dump con il prefisso indicato in `directory` e rimuove
 * i piu' vecchi. Il timestamp ISO nel nome rende l'ordinamento lessicografico cronologico.
 * Restituisce i nomi dei file rimossi.
 */
export async function pruneDatabaseDumps(
	directory: string,
	keep: number,
	prefix = PRE_IMPORT_DUMP_PREFIX
): Promise<string[]> {
	const dumps = (await readdir(directory))
		.filter((name) => name.startsWith(`${prefix}-`) && name.endsWith('.sql.gz'))
		.sort();
	const stale = dumps.slice(0, Math.max(0, dumps.length - Math.max(1, keep)));
	for (const name of stale) {
		await rm(join(directory, name), { force: true });
	}
	return stale;
}
