import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { gunzipSync } from 'node:zlib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { GET } from './+server';

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

function event(role: string) {
	return {
		locals: { verifyStaffOrAdmin: async () => ({ role }) },
		request: new Request('http://localhost/admin/maintenance/backup')
	} as Parameters<typeof GET>[0];
}

function fakeDump() {
	const child = new EventEmitter() as EventEmitter & {
		stdout: PassThrough;
		stderr: PassThrough;
		exitCode: number | null;
		kill: ReturnType<typeof vi.fn>;
	};
	child.stdout = new PassThrough();
	child.stderr = new PassThrough();
	child.exitCode = null;
	child.kill = vi.fn();
	vi.mocked(spawn).mockReturnValue(child as never);
	setTimeout(() => child.emit('spawn'), 0);
	return child;
}

describe('database backup download', () => {
	beforeEach(() => vi.clearAllMocks());

	it('only allows administrators', async () => {
		const response = await GET(event('staff'));
		expect(response.status).toBe(403);
		expect(spawn).not.toHaveBeenCalled();
	});

	it('streams a compressed SQL dump and keeps the password out of arguments', async () => {
		const child = fakeDump();
		const response = await GET(event('admin'));
		expect(response.headers.get('Content-Disposition')).toContain('.sql.gz');
		const [, args, options] = vi.mocked(spawn).mock.calls[0];
		expect(args).toContain('--single-transaction');
		expect(args?.[0]).toBe('--no-defaults');
		expect(args).toContain('--routines');
		expect(args).toContain('--events');
		expect(args).toContain('nz_badge');
		expect(JSON.stringify(args)).not.toContain('secret');
		expect(options?.env?.MYSQL_PWD).toBe('secret');
		child.stdout.end('CREATE TABLE example (id INT);\n');
		child.exitCode = 0;
		child.emit('close', 0);
		expect(gunzipSync(Buffer.from(await response.arrayBuffer())).toString()).toBe(
			'CREATE TABLE example (id INT);\n'
		);
	});

	it('fails the download when mysqldump exits unsuccessfully', async () => {
		const child = fakeDump();
		const response = await GET(event('admin'));
		const download = response.arrayBuffer();
		child.stdout.end('partial SQL');
		child.exitCode = 1;
		child.emit('close', 1);
		await expect(download).rejects.toThrow('Database dump failed');
	});
});
