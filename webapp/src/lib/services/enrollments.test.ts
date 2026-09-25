import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enrollments, subscribers } from '$lib/db/schema';

const mocks = vi.hoisted(() => {
	const state = {
		lockAcquired: 1,
		selectResults: [] as unknown[][],
		locks: [] as string[],
		inserts: [] as { table: unknown; values: Record<string, unknown>; onDuplicate?: unknown }[],
		failInsertFor: null as string | null,
		nextSubscriberId: 100
	};

	const connection = {
		query: vi.fn(async (statement: string) =>
			statement.includes('GET_LOCK') ? [[{ acquired: state.lockAcquired }]] : [[{}]]
		),
		release: vi.fn()
	};

	const tx = {
		select: vi.fn(() => {
			const rows = state.selectResults.shift() ?? [];
			const limited = Object.assign(Promise.resolve(rows), {
				for: vi.fn((strength: string) => {
					state.locks.push(strength);
					return Promise.resolve(rows);
				})
			});
			const where = vi.fn(() => ({ limit: vi.fn(() => limited) }));
			return { from: vi.fn(() => ({ where })) };
		}),
		insert: vi.fn((table: unknown) => ({
			values: (values: Record<string, unknown>) => {
				const entry: (typeof state.inserts)[number] = { table, values };
				return {
					$returningId: async () => {
						state.inserts.push(entry);
						return [{ id: state.nextSubscriberId++ }];
					},
					onDuplicateKeyUpdate: async (config: unknown) => {
						if (state.failInsertFor && values.externalId === state.failInsertFor) {
							throw new Error('insert failed');
						}
						state.inserts.push({ ...entry, onDuplicate: config });
					}
				};
			}
		})),
		update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) }))
	};

	const db = {
		$client: { getConnection: vi.fn(async () => connection) },
		insert: vi.fn(() => ({ values: () => ({ $returningId: async () => [{ id: 1 }] }) })),
		update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })),
		transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx))
	};

	return { state, connection, tx, db };
});

vi.mock('$lib/db', () => ({ db: mocks.db }));
vi.mock('./settings', () => ({
	getSetting: vi.fn(),
	setSettings: vi.fn(),
	getSettings: vi.fn(async () => ({
		enrollment_api_url: 'https://enrollments.test',
		enrollment_api_key: 'api-key'
	}))
}));

import {
	buildFlatTarget,
	EnrollmentSyncInProgressError,
	syncEnrollments,
	type ApiEnrollment
} from './enrollments';

function apiEnrollment(overrides: Partial<ApiEnrollment> = {}): ApiEnrollment {
	return {
		id: 'enr-1',
		orderId: 'order-1',
		orderName: '#1001',
		lineItemId: 'line-1',
		productId: 'prod-1',
		variantId: 'var-1',
		productTitle: 'Corso base',
		variantTitle: 'Ottobre 2026',
		quantity: 2,
		customerEmail: 'buyer@example.com',
		customerDisplayName: 'Anna Verdi',
		participants: [
			{ index: 0, firstName: 'Mario', lastName: 'Rossi', email: 'mario@example.com', phone: null },
			{ index: 1, firstName: 'Luca', lastName: 'Bianchi', email: null, phone: '333' }
		],
		firstName: null,
		lastName: null,
		phone: null,
		fiscalCode: null,
		vatNumber: null,
		courseClass: null,
		enrollmentType: { id: 4, name: 'Base', courseClass: 'A', courseType: 'full', duration: 30 },
		preferredDate: '2026-10-01',
		endDate: '2026-10-31',
		notes: null,
		submittedAt: null,
		status: 'COMPLETED',
		createdAt: '2026-09-01T10:00:00.000Z',
		updatedAt: '2026-09-02T10:00:00.000Z',
		...overrides
	};
}

const fetchMock = vi.fn();

beforeEach(() => {
	vi.clearAllMocks();
	Object.assign(mocks.state, {
		lockAcquired: 1,
		selectResults: [],
		locks: [],
		inserts: [],
		failInsertFor: null,
		nextSubscriberId: 100
	});
	fetchMock.mockImplementation(
		async () =>
			new Response(
				JSON.stringify({
					data: [apiEnrollment()],
					meta: { total: 1, page: 1, limit: 100, pages: 1 }
				})
			)
	);
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('syncEnrollments', () => {
	it('writes subscriber and enrollment of each participant in its own transaction', async () => {
		const result = await syncEnrollments('manual');

		expect(result).toEqual({
			enrollmentsFound: 1,
			enrollmentsCreated: 2,
			subscribersCreated: 2,
			errors: 0
		});
		expect(mocks.db.transaction).toHaveBeenCalledTimes(2);
		expect(mocks.state.locks).toEqual(['update', 'update']);

		const enrollmentInserts = mocks.state.inserts.filter((i) => i.table === enrollments);
		expect(enrollmentInserts.map((i) => i.values.externalId)).toEqual(['enr-1_0', 'enr-1_1']);
		expect(enrollmentInserts[1].values).toMatchObject({
			subscriberId: 101,
			customerEmail: 'buyer@example.com',
			quantity: 1,
			phone: '333'
		});
		// Upsert on external_id; creation timestamp and external id are not overwritten
		const { set } = enrollmentInserts[0].onDuplicate as { set: Record<string, unknown> };
		expect(set).toMatchObject({ subscriberId: 100, orderId: 'order-1', status: 'COMPLETED' });
		expect(set).not.toHaveProperty('externalId');
		expect(set).not.toHaveProperty('externalCreatedAt');

		const subscriberInserts = mocks.state.inserts.filter((i) => i.table === subscribers);
		expect(subscriberInserts[0].values).toMatchObject({
			firstName: 'Mario',
			email: 'mario@example.com',
			courseName: 'Ottobre 2026',
			status: 'active'
		});
	});

	it('sets a timeout on the API request and releases the named lock', async () => {
		await syncEnrollments('manual');

		const [, init] = fetchMock.mock.calls[0];
		expect(init.signal).toBeInstanceOf(AbortSignal);
		expect(init.headers).toEqual({ Authorization: 'Bearer api-key' });
		const statements = mocks.connection.query.mock.calls.map(([statement]) => statement);
		expect(statements[0]).toContain('GET_LOCK');
		expect(statements[1]).toContain('RELEASE_LOCK');
		expect(mocks.connection.release).toHaveBeenCalledTimes(1);
	});

	it('refuses to start while another sync holds the lock', async () => {
		mocks.state.lockAcquired = 0;

		await expect(syncEnrollments('manual')).rejects.toBeInstanceOf(EnrollmentSyncInProgressError);
		expect(fetchMock).not.toHaveBeenCalled();
		expect(mocks.db.insert).not.toHaveBeenCalled();
		expect(mocks.connection.release).toHaveBeenCalledTimes(1);
	});

	it('does not count a participant whose transaction failed', async () => {
		mocks.state.failInsertFor = 'enr-1_1';

		const result = await syncEnrollments('manual');

		expect(result).toMatchObject({ enrollmentsCreated: 1, subscribersCreated: 1, errors: 1 });
	});

	it('skips rows that already exist when not upserting', async () => {
		mocks.state.selectResults.push([{ id: 7, subscriberId: 70 }], [{ id: 8, subscriberId: 80 }]);

		const result = await syncEnrollments('manual');

		expect(result).toMatchObject({ enrollmentsCreated: 0, subscribersCreated: 0 });
		expect(mocks.state.inserts).toEqual([]);
	});
});

describe('buildFlatTarget', () => {
	it('maps legacy flat fields and reuses subscribers by email', () => {
		const target = buildFlatTarget(
			apiEnrollment({ participants: [], firstName: null, lastName: null, fiscalCode: 'RSSMRA' })
		);

		expect(target.externalId).toBe('enr-1');
		expect(target.matchSubscriberByEmail).toBe(true);
		expect(target.enrollment).toMatchObject({ quantity: 2, fiscalCode: 'RSSMRA', firstName: null });
		expect(target.subscriber).toMatchObject({
			firstName: 'Anna',
			lastName: 'Verdi',
			email: 'buyer@example.com',
			taxId: 'RSSMRA'
		});
	});
});
