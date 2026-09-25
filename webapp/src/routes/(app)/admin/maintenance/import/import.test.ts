import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { gzipSync } from 'node:zlib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { POST } from './+server';

vi.mock('$env/dynamic/private', () => ({
	env: { DATABASE_URL: 'mysql://backup:secret@db:3306/nz_badge' }
}));
vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
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
		locals: { verifyAdmin: async () => ({ role }) },
		request,
		url: new URL(request.url)
	} as Parameters<typeof POST>[0];
}

function mockMysql(exitCodes: number[] = []) {
	let call = 0;
	vi.mocked(spawn).mockImplementation(() => {
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
	});
}

describe('database import', () => {
	beforeEach(() => vi.clearAllMocks());

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
			locals: { verifyAdmin: async () => ({ role: 'admin' }) },
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

	it('checks the client, replaces the database, and imports verified SQL', async () => {
		mockMysql();
		const response = await POST(event(validSql));
		expect(response.status).toBe(200);
		expect(spawn).toHaveBeenCalledTimes(3);
		const calls = vi.mocked(spawn).mock.calls;
		expect(calls[0][1]).toContain('SELECT 1;');
		expect(JSON.stringify(calls[1][1])).toContain('DROP DATABASE IF EXISTS');
		expect(calls[2][1]).not.toContain('--database=nz_badge');
		expect(calls[0][2]?.env?.MYSQL_PWD).toBe('secret');
	});
});
