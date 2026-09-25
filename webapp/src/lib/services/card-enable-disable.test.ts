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
	const set = vi.fn(() => ({ where: vi.fn(async () => undefined) }));
	const tx = { select, update: vi.fn(() => ({ set })) };
	return {
		selectResults,
		locks,
		set,
		tx,
		logAudit: vi.fn(),
		db: { transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)) }
	};
});

vi.mock('$lib/db', () => ({ db: mocks.db }));
vi.mock('./audit', () => ({ logAudit: mocks.logAudit }));
vi.mock('./mifare-keys', () => ({
	getMifareKeyConfig: vi.fn(),
	isMifareEnabled: vi.fn(),
	getOrCreateGlobalKeys: vi.fn()
}));

import { disableCard, disposeSessionStores, enableCard } from './card-writer';

const admin = { id: 1, role: 'admin' } as User;
const staffCard = { id: 10, userId: 3, subscriberId: null, type: 'rfid', status: 'disabled' };

afterAll(() => disposeSessionStores());

beforeEach(() => {
	vi.clearAllMocks();
	mocks.selectResults.length = 0;
	mocks.locks.length = 0;
});

describe('enableCard', () => {
	it('locks card, owner and sibling cards, then enables and audits in the transaction', async () => {
		mocks.selectResults.push(
			[staffCard],
			[{ status: 'active' }],
			[],
			[{ ...staffCard, status: 'active' }]
		);
		const updated = await enableCard(10, admin);
		expect(updated.status).toBe('active');
		expect(mocks.locks).toEqual(['update', 'update', 'update']);
		expect(mocks.set).toHaveBeenCalledWith({ status: 'active' });
		expect(mocks.logAudit).toHaveBeenCalledWith(
			expect.objectContaining({ action: 'CARD_ENABLE', entityType: 'card', entityId: 10 }),
			mocks.tx
		);
	});

	it('refuses a second active RFID card for the same user', async () => {
		mocks.selectResults.push([staffCard], [{ status: 'active' }], [{ id: 11 }]);
		await expect(enableCard(10, admin)).rejects.toMatchObject({
			code: 'INVALID_STATE',
			message: 'L’utente ha già una card RFID attiva'
		});
		expect(mocks.set).not.toHaveBeenCalled();
		expect(mocks.logAudit).not.toHaveBeenCalled();
	});

	it('refuses when the owner is not active', async () => {
		mocks.selectResults.push([staffCard], [{ status: 'deleted' }]);
		await expect(enableCard(10, admin)).rejects.toMatchObject({ code: 'INVALID_STATE' });
		expect(mocks.set).not.toHaveBeenCalled();
	});

	it('refuses a card that is not disabled and a missing card', async () => {
		mocks.selectResults.push([{ ...staffCard, status: 'deleted' }]);
		await expect(enableCard(10, admin)).rejects.toMatchObject({ code: 'INVALID_STATE' });
		mocks.selectResults.push([]);
		await expect(enableCard(10, admin)).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});
});

describe('disableCard', () => {
	it('disables an active card and audits it', async () => {
		mocks.selectResults.push(
			[{ ...staffCard, status: 'active' }],
			[{ ...staffCard, status: 'disabled' }]
		);
		const updated = await disableCard(10, admin);
		expect(updated.status).toBe('disabled');
		expect(mocks.locks).toEqual(['update']);
		expect(mocks.logAudit).toHaveBeenCalledWith(
			expect.objectContaining({ action: 'CARD_DISABLE', entityType: 'card' }),
			mocks.tx
		);
	});

	it('refuses a deleted card instead of resurrecting it as disabled', async () => {
		mocks.selectResults.push([{ ...staffCard, status: 'deleted' }]);
		await expect(disableCard(10, admin)).rejects.toMatchObject({ code: 'INVALID_STATE' });
		expect(mocks.set).not.toHaveBeenCalled();
	});
});
