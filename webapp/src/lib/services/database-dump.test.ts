import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_BACKUP_KEEP, pruneDatabaseDumps, resolveBackupKeep } from './database-dump';

describe('resolveBackupKeep', () => {
	it('uses the default for missing or invalid values', () => {
		expect(resolveBackupKeep(undefined)).toBe(DEFAULT_BACKUP_KEEP);
		expect(resolveBackupKeep('')).toBe(DEFAULT_BACKUP_KEEP);
		expect(resolveBackupKeep('0')).toBe(DEFAULT_BACKUP_KEEP);
		expect(resolveBackupKeep('-3')).toBe(DEFAULT_BACKUP_KEEP);
		expect(resolveBackupKeep('2.5')).toBe(DEFAULT_BACKUP_KEEP);
		expect(resolveBackupKeep('abc')).toBe(DEFAULT_BACKUP_KEEP);
	});

	it('accepts a positive integer', () => {
		expect(resolveBackupKeep(' 3 ')).toBe(3);
	});
});

describe('pruneDatabaseDumps', () => {
	let directory: string;

	beforeEach(() => {
		directory = mkdtempSync(join(tmpdir(), 'nz-badge-prune-test-'));
	});

	afterEach(() => rmSync(directory, { recursive: true, force: true }));

	it('keeps only the newest dumps and ignores unrelated files', async () => {
		const dumps = [
			'nz-badge-pre-import-2026-01-01T10-00-00-000Z.sql.gz',
			'nz-badge-pre-import-2026-02-01T10-00-00-000Z.sql.gz',
			'nz-badge-pre-import-2026-03-01T10-00-00-000Z.sql.gz'
		];
		for (const name of [...dumps, 'manual-backup.sql.gz', 'notes.txt']) {
			writeFileSync(join(directory, name), 'x');
		}

		const removed = await pruneDatabaseDumps(directory, 2);

		expect(removed).toEqual([dumps[0]]);
		expect(readdirSync(directory).sort()).toEqual(
			['manual-backup.sql.gz', 'notes.txt', dumps[1], dumps[2]].sort()
		);
	});

	it('never removes the most recent dump', async () => {
		writeFileSync(join(directory, 'nz-badge-pre-import-2026-01-01.sql.gz'), 'x');
		expect(await pruneDatabaseDumps(directory, 0)).toEqual([]);
	});
});
