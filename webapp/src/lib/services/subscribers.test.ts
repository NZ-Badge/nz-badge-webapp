import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	// Each tx.select() consumes the next queued result; `.for('update')` is recorded.
	const selectResults: unknown[][] = [];
	const lockedSelects = vi.fn();
	const select = vi.fn(() => {
		const rows = selectResults.shift() ?? [];
		const limited = Object.assign(Promise.resolve(rows), {
			for: vi.fn((strength: string) => {
				lockedSelects(strength);
				return Promise.resolve(rows);
			})
		});
		const where = vi.fn(() => ({ limit: vi.fn(() => limited) }));
		return { from: vi.fn(() => ({ where })) };
	});
	const updateWhere = vi.fn(async () => undefined);
	const set = vi.fn(() => ({ where: updateWhere }));
	const returningId = vi.fn(async () => [{ id: 42 }]);
	const values = vi.fn(() => ({ $returningId: returningId }));
	const tx = { select, update: vi.fn(() => ({ set })), insert: vi.fn(() => ({ values })) };
	return {
		selectResults,
		lockedSelects,
		set,
		values,
		tx,
		logAudit: vi.fn(),
		db: { transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)) }
	};
});

vi.mock('$lib/db', () => ({ db: mocks.db }));
vi.mock('$lib/services/audit', () => ({ logAudit: mocks.logAudit }));

import {
	createSubscriber,
	removeSubscriber,
	subscriberInputFromForm,
	SubscriberServiceError,
	updateSubscriber
} from './subscribers';

const actor = { id: 1 };
const subscriber = {
	id: 42,
	firstName: 'Mario',
	lastName: 'Rossi',
	email: 'mario@example.com',
	phone: '333',
	taxId: null,
	status: 'active'
};

beforeEach(() => {
	vi.clearAllMocks();
	mocks.selectResults.length = 0;
});

describe('createSubscriber', () => {
	it('validates, inserts and audits in the same transaction', async () => {
		mocks.selectResults.push([subscriber]);
		const created = await createSubscriber(
			{
				firstName: ' Mario ',
				lastName: 'Rossi',
				email: 'mario@example.com',
				taxId: 'rssmra80a01h501u'
			},
			actor
		);
		expect(created).toEqual(subscriber);
		expect(mocks.values).toHaveBeenCalledWith({
			firstName: 'Mario',
			lastName: 'Rossi',
			email: 'mario@example.com',
			taxId: 'RSSMRA80A01H501U'
		});
		expect(mocks.logAudit).toHaveBeenCalledWith(
			expect.objectContaining({ action: 'CREATE', entityType: 'subscriber', entityId: 42 }),
			mocks.tx
		);
	});

	it('rejects invalid input before opening a transaction', async () => {
		await expect(createSubscriber({ firstName: '', email: 'x' }, actor)).rejects.toMatchObject({
			code: 'VALIDATION_ERROR'
		} satisfies Partial<SubscriberServiceError>);
		expect(mocks.db.transaction).not.toHaveBeenCalled();
	});
});

describe('updateSubscriber', () => {
	it('updates only the provided fields and converts dates', async () => {
		mocks.selectResults.push([subscriber], [{ ...subscriber, phone: null }]);
		await updateSubscriber(42, { phone: null, courseEndDate: '2026-06-30' }, actor);
		expect(mocks.set).toHaveBeenCalledWith({
			phone: null,
			courseEndDate: new Date('2026-06-30')
		});
		expect(mocks.lockedSelects).toHaveBeenCalledWith('update');
		expect(mocks.logAudit).toHaveBeenCalledWith(
			expect.objectContaining({ action: 'UPDATE', entityType: 'subscriber' }),
			mocks.tx
		);
	});

	it('reports a missing subscriber', async () => {
		mocks.selectResults.push([]);
		await expect(updateSubscriber(99, { phone: '1' }, actor)).rejects.toMatchObject({
			code: 'NOT_FOUND'
		});
		expect(mocks.set).not.toHaveBeenCalled();
	});

	it('maps the admin form, clearing empty optional fields', () => {
		const form = new FormData();
		form.set('firstName', ' Anna ');
		form.set('lastName', 'Bianchi');
		form.set('email', 'anna@example.com');
		form.set('phone', '');
		form.set('taxCode', 'abc');
		form.set('notes', '  ');
		expect(subscriberInputFromForm(form)).toEqual({
			firstName: 'Anna',
			lastName: 'Bianchi',
			email: 'anna@example.com',
			phone: null,
			taxId: 'abc',
			note: null,
			status: 'active'
		});
	});
});

describe('removeSubscriber', () => {
	it('soft deletes by setting status cancelled and audits a DELETE', async () => {
		mocks.selectResults.push([subscriber], [], [{ ...subscriber, status: 'cancelled' }]);
		const removed = await removeSubscriber(42, actor);
		expect(removed.status).toBe('cancelled');
		expect(mocks.set).toHaveBeenCalledWith({ status: 'cancelled' });
		expect(mocks.logAudit).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'DELETE',
				entityType: 'subscriber',
				dataAfter: { status: 'cancelled', softDelete: true }
			}),
			mocks.tx
		);
	});

	it('refuses while the subscriber has an active card', async () => {
		mocks.selectResults.push([subscriber], [{ id: 5 }]);
		await expect(removeSubscriber(42, actor)).rejects.toMatchObject({ code: 'HAS_ACTIVE_CARD' });
		expect(mocks.set).not.toHaveBeenCalled();
		expect(mocks.logAudit).not.toHaveBeenCalled();
	});
});
