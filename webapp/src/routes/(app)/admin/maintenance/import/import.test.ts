import { EventEmitter } from 'node:events';
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { gunzipSync, gzipSync } from 'node:zlib';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { POST } from './+server';

const paths = await vi.hoisted(async () => {
	const { tmpdir } = await import('node:os');
	return { backupDir: `${tmpdir()}/nz-badge-import-test-${process.pid}` };
});

vi.mock('$env/dynamic/private', () => ({
	env: { DATABASE_URL: 'mysql://backup:secret@db:3306/nz_badge', DB_BACKUP_DIR: paths.backupDir }
}));
vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
vi.mock('$lib/services/settings', () => ({ invalidateSettingsCache: vi.fn() }));
const logAudit = vi.hoisted(() => vi.fn());
vi.mock('$lib/services/audit', () => ({ logAudit }));
vi.mock('$lib/services/auth', () => {
	class AuthError extends Error {
		constructor(public code: string) {
			super(code);
		}
	}
	return {
		AuthError,
		requireAdmin: (user: { role: string }) => {
			if (user.role !== 'admin') throw new AuthError('FORBIDDEN');
		}
	};
});

const origin = 'http://localhost';
const validSql =
	'CREATE DATABASE /*!32312 IF NOT EXISTS*/ `nz_badge`;\nUSE `nz_badge`;\nCREATE TABLE example (id INT);\n';

function event(sql: string, role = 'admin', confirmation = 'SOVRASCRIVI') {
	const request = new Request(`${origin}/admin/maintenance/import`, {
		method: 'POST',
		headers: {
			origin,
			'content-type': 'application/gzip',
			'x-confirm-replace': confirmation
		},
		body: gzipSync(sql)
	});
	return {
		locals: { verifyStaffOrAdmin: async () => ({ role }) },
		request,
		url: new URL(request.url)
	} as Parameters<typeof POST>[0];
}

const CURRENT_DUMP = 'CREATE DATABASE `nz_badge`;\nUSE `nz_badge`;\n-- current data\n';

function mockMysql(exitCodes: number[] = [], dumpExitCode = 0) {
	let call = 0;
	vi.mocked(spawn).mockImplementation(((command: string) => {
		if (command === 'mysqldump') {
			const dump = new EventEmitter() as EventEmitter & {
				stdout: PassThrough;
				stderr: PassThrough;
				exitCode: number | null;
				kill: () => void;
			};
			dump.stdout = new PassThrough();
			dump.stderr = new PassThrough();
			dump.exitCode = null;
			dump.kill = () => undefined;
			setTimeout(() => {
				dump.emit('spawn');
				dump.stdout.end(CURRENT_DUMP);
				dump.stdout.once('end', () => {
					dump.exitCode = dumpExitCode;
					dump.emit('close', dumpExitCode);
				});
			}, 0);
			return dump as never;
		}
		const exitCode = exitCodes[call++] ?? 0;
		const child = new EventEmitter() as EventEmitter & {
			stdin: PassThrough;
			stderr: PassThrough;
		};
		child.stdin = new PassThrough();
		child.stderr = new PassThrough();
		child.stdin.resume();
		child.stdin.once('finish', () => child.emit('close', exitCode));
		setTimeout(() => child.emit('spawn'), 0);
		return child as never;
	}) as never);
}

function mysqlCalls() {
	return vi.mocked(spawn).mock.calls.filter(([command]) => command !== 'mysqldump');
}

function savedBackups(): string[] {
	try {
		return readdirSync(paths.backupDir);
	} catch {
		return [];
	}
}

afterAll(() => rmSync(paths.backupDir, { recursive: true, force: true }));

describe('database import', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		rmSync(paths.backupDir, { recursive: true, force: true });
	});

	it('rejects staff and missing confirmation before reading the archive', async () => {
		expect((await POST(event(validSql, 'staff'))).status).toBe(403);
		expect((await POST(event(validSql, 'admin', ''))).status).toBe(403);
		expect(spawn).not.toHaveBeenCalled();
	});

	it('rejects a backup for another database without changing anything', async () => {
		const response = await POST(event(validSql.replaceAll('nz_badge', 'other')));
		expect(response.status).toBe(400);
		expect(spawn).not.toHaveBeenCalled();
	});

	it('rejects a corrupt gzip stream without changing anything', async () => {
		const request = new Request(`${origin}/admin/maintenance/import`, {
			method: 'POST',
			headers: { origin, 'content-type': 'application/gzip', 'x-confirm-replace': 'SOVRASCRIVI' },
			body: 'not gzip'
		});
		const response = await POST({
			locals: { verifyStaffOrAdmin: async () => ({ role: 'admin' }) },
			request,
			url: new URL(request.url)
		} as Parameters<typeof POST>[0]);
		expect(response.status).toBe(400);
		expect(spawn).not.toHaveBeenCalled();
	});

	it('does not replace the database if the client preflight fails', async () => {
		mockMysql([1]);
		const response = await POST(event(validSql));
		expect(response.status).toBe(400);
		expect(spawn).toHaveBeenCalledTimes(1);
	});

	it('checks the client, dumps the current database, replaces it, and imports verified SQL', async () => {
		mockMysql();
		const response = await POST(event(validSql));
		expect(response.status).toBe(200);
		const allCalls = vi.mocked(spawn).mock.calls.map(([command]) => command);
		expect(allCalls).toEqual(['mysql', 'mysqldump', 'mysql', 'mysql']);
		const calls = mysqlCalls();
		expect(calls[0][1]).toContain('SELECT 1;');
		expect(JSON.stringify(calls[1][1])).toContain('DROP DATABASE IF EXISTS');
		expect(calls[2][1]).not.toContain('--database=nz_badge');
		expect(calls[0][2]?.env?.MYSQL_PWD).toBe('secret');

		const [backup] = savedBackups();
		expect(backup).toMatch(/^nz-badge-pre-import-.*\.sql\.gz$/);
		expect(gunzipSync(readFileSync(join(paths.backupDir, backup))).toString()).toBe(CURRENT_DUMP);
		expect(logAudit).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'DB_IMPORT',
				entityType: 'database',
				dataAfter: { success: true, safetyBackupFile: backup }
			})
		);
	});

	it('does not drop the database when the safety dump fails', async () => {
		mockMysql([], 2);
		const response = await POST(event(validSql));
		expect(response.status).toBe(500);
		expect(mysqlCalls()).toHaveLength(1);
		expect(savedBackups()).toEqual([]);
		expect(logAudit).not.toHaveBeenCalled();
	});

	it('refuses a concurrent import while one is running', async () => {
		mockMysql();
		const first = POST(event(validSql));
		const second = await POST(event(validSql));
		expect(second.status).toBe(409);
		expect((await first).status).toBe(200);
	});
});
