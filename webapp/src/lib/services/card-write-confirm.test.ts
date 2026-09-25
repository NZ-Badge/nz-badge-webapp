import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '$lib/db/schema';

const mocks = vi.hoisted(() => {
	const selectResults: unknown[][] = [];
	const locks: string[] = [];
	const select = vi.fn(() => {
		const rows = selectResults.shift() ?? [];
		const limited = Object.assign(Promise.resolve(rows), {
			for: vi.fn((strength: string) => {
				locks.push(strength);
				return Promise.resolve(rows);
			})
		});
		const where = vi.fn(() => ({ limit: vi.fn(() => limited) }));
		return { from: vi.fn(() => ({ where })) };
	});
	const insertValues = vi.fn(async (): Promise<unknown> => [{ insertId: 55 }]);
	const tx = { select, insert: vi.fn(() => ({ values: insertValues })), update: vi.fn() };
	return {
		selectResults,
		locks,
		insertValues,
		tx,
		logAudit: vi.fn(),
		db: {
			select,
			transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx))
		}
	};
});

vi.mock('$lib/db', () => ({ db: mocks.db }));
vi.mock('./audit', () => ({ logAudit: mocks.logAudit }));
vi.mock('./mifare-keys', () => ({
	getMifareKeyConfig: vi.fn(async () => ({ useMifare: false, useSingleKey: false })),
	isMifareEnabled: vi.fn(),
	getOrCreateGlobalKeys: vi.fn()
}));

import { authorizeUserCardWrite, confirmCardWrite, disposeSessionStores } from './card-writer';

const admin = { id: 1, role: 'admin' } as User;
const UID = 'AA:BB:CC:DD';

async function openUserSession(): Promise<string> {
	// authorize: owner active, no active RFID card yet
	mocks.selectResults.push([{ id: 3, status: 'active' }], []);
	const session = await authorizeUserCardWrite(3);
	mocks.locks.length = 0;
	return session.session_token;
}

afterAll(() => disposeSessionStores());

beforeEach(() => {
	vi.clearAllMocks();
	mocks.selectResults.length = 0;
	mocks.locks.length = 0;
	mocks.insertValues.mockImplementation(async () => [{ insertId: 55 }]);
});

describe('confirmCardWrite', () => {
	it('locks owner, sibling cards and UID, then inserts and audits in one transaction', async () => {
		const token = await openUserSession();
		mocks.selectResults.push([{ status: 'active' }], [], []);

		await expect(confirmCardWrite(token, UID, admin)).resolves.toEqual({ id: 55, uid: UID });

		expect(mocks.db.transaction).toHaveBeenCalledTimes(1);
		expect(mocks.locks).toEqual(['update', 'update', 'update']);
		expect(mocks.insertValues).toHaveBeenCalledWith(
			expect.objectContaining({ uid: UID, userId: 3, subscriberId: null, status: 'active' })
		);
		expect(mocks.logAudit).toHaveBeenCalledWith(
			expect.objectContaining({ action: 'CARD_WRITE', entityId: 55 }),
			mocks.tx
		);
		// Session consumed on success
		await expect(confirmCardWrite(token, UID, admin)).rejects.toMatchObject({
			code: 'SESSION_EXPIRED'
		});
	});

	it('refuses a second active RFID card for the same user', async () => {
		const token = await openUserSession();
		mocks.selectResults.push([{ status: 'active' }], [{ id: 9 }]);

		await expect(confirmCardWrite(token, UID, admin)).rejects.toMatchObject({
			code: 'INVALID_STATE'
		});
		expect(mocks.insertValues).not.toHaveBeenCalled();
		expect(mocks.logAudit).not.toHaveBeenCalled();
	});

	it('maps a concurrent duplicate UID insert to UID_ALREADY_EXISTS', async () => {
		const token = await openUserSession();
		mocks.selectResults.push([{ status: 'active' }], [], []);
		mocks.insertValues.mockRejectedValueOnce(
			Object.assign(new Error('Failed query'), { cause: { code: 'ER_DUP_ENTRY' } })
		);

		await expect(confirmCardWrite(token, UID, admin)).rejects.toMatchObject({
			code: 'UID_ALREADY_EXISTS'
		});
	});

	it('keeps the session when the UID is in deleted history, so the reuse can be confirmed', async () => {
		const token = await openUserSession();
		mocks.selectResults.push([{ status: 'active' }], [], [{ id: 20, status: 'deleted' }]);

		await expect(confirmCardWrite(token, UID, admin)).rejects.toMatchObject({
			code: 'UID_IN_DELETED_HISTORY'
		});

		const set = vi.fn(() => ({ where: vi.fn(async () => undefined) }));
		mocks.tx.update.mockReturnValue({ set });
		mocks.selectResults.push(
			[{ status: 'active' }],
			[],
			[{ id: 20, status: 'deleted', subscriberId: null, deletedAt: null }]
		);
		await expect(confirmCardWrite(token, UID, admin, true)).resolves.toEqual({ id: 20, uid: UID });
		expect(set).toHaveBeenCalledWith(expect.objectContaining({ status: 'active', userId: 3 }));
	});
});
