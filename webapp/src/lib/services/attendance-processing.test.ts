import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	attendance,
	cardRfid,
	enrollments,
	staffAttendance,
	type CardRfid,
	type Subscriber,
	type User
} from '$lib/db/schema';

/**
 * Fake minimale di una transazione Drizzle: risponde in base alla tabella e ai campi
 * selezionati, e registra gli insert. Basta a fissare il comportamento condiviso di
 * `processSingleAttendance` / `processBatchAttendance` senza un database reale.
 */
interface FakeDbState {
	settings: { key: string; value: string }[];
	cardRow: { card: CardRfid; subscriber: Subscriber | null; user: User | null } | undefined;
	inCourse: boolean;
	recentSwipe: boolean;
	lastEvent: { eventType: 'entry' | 'exit'; readTimestamp: Date } | undefined;
	inserts: { table: unknown; values: Record<string, unknown> }[];
	transactions: number;
}

const state = vi.hoisted(() => ({ current: null as unknown as FakeDbState }));

function resolveSelect(table: unknown, fields: Record<string, unknown> | undefined): unknown[] {
	const s = state.current;
	if (table === cardRfid) return s.cardRow ? [s.cardRow] : [];
	if (table === enrollments) return s.inCourse ? [{ id: 1 }] : [];
	if (table === attendance || table === staffAttendance) {
		if (fields && 'eventType' in fields) return s.lastEvent ? [s.lastEvent] : [];
		return s.recentSwipe ? [{ id: 99 }] : [];
	}
	throw new Error('Unexpected table in fake select');
}

function createFakeTx() {
	return {
		select(fields?: Record<string, unknown>) {
			let table: unknown;
			const builder = {
				from(t: unknown) {
					table = t;
					return builder;
				},
				leftJoin: () => builder,
				where: () => builder,
				orderBy: () => builder,
				limit: () => builder,
				then<T>(resolve: (rows: unknown[]) => T, reject?: (err: unknown) => T) {
					try {
						return Promise.resolve(resolve(resolveSelect(table, fields)));
					} catch (err) {
						return reject ? Promise.resolve(reject(err)) : Promise.reject(err);
					}
				}
			};
			return builder;
		},
		insert(table: unknown) {
			return {
				values: async (values: Record<string, unknown>) => {
					state.current.inserts.push({ table, values });
				}
			};
		}
	};
}

vi.mock('$lib/services/settings', async () => {
	const { parseSettingRows } = await import('$lib/services/settings-schema');
	return { getSettings: async () => parseSettingRows(state.current.settings) };
});

vi.mock('$lib/db', () => ({
	db: {
		transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
			state.current.transactions++;
			return fn(createFakeTx());
		}
	}
}));

import { processBatchAttendance, processSingleAttendance } from '$lib/services/attendance';

const UID = 'FE:B2:25:07';
const QUEUE = { pending: 3, storage_free_percent: 80 };
const BATCH_INFO = { total_queued: 2, batch_sequence: 1 };

function subscriberCard(overrides: Partial<CardRfid> = {}) {
	return {
		card: { uid: UID, status: 'active', subscriberId: 42, userId: null, ...overrides } as CardRfid,
		subscriber: { id: 42, firstName: 'Mario', lastName: 'Rossi ' } as Subscriber,
		user: null
	};
}

function staffCard() {
	return {
		card: { uid: UID, status: 'active', subscriberId: null, userId: 7 } as CardRfid,
		subscriber: null,
		user: { id: 7, name: 'Giulia Bianchi', status: 'active' } as User
	};
}

function minutesFromNow(minutes: number): string {
	return new Date(Date.now() + minutes * 60_000).toISOString();
}

// Il `type` inviato dal device viene ignorato: entry/exit e' deciso lato server.
function event(timestamp: string) {
	return { uid: UID, timestamp, type: 'exit' as const };
}

beforeEach(() => {
	state.current = {
		settings: [
			{ key: 'reset_entry_type_daily', value: 'false' },
			{ key: 'min_swipe_interval_minutes', value: '15' },
			{ key: 'enforce_course_date_range', value: 'true' }
		],
		cardRow: subscriberCard(),
		inCourse: true,
		recentSwipe: false,
		lastEvent: undefined,
		inserts: [],
		transactions: 0
	};
});

describe('processSingleAttendance', () => {
	it('confirms a valid swipe inside a transaction and keeps the response shape', async () => {
		const result = await processSingleAttendance([event(minutesFromNow(0))], 'reader-1', QUEUE);

		expect(state.current.transactions).toBe(1);
		expect(Object.keys(result).sort()).toEqual(['accepted', 'actions', 'rejected', 'server_time']);
		expect(result.accepted).toBe(1);
		expect(result.rejected).toBe(0);
		expect(result.actions).toEqual([
			{ uid: UID, action: 'confirm', user_name: 'Mario Rossi', type: 'entry' }
		]);
		expect(state.current.inserts).toHaveLength(1);
		expect(state.current.inserts[0].table).toBe(attendance);
		expect(state.current.inserts[0].values).toMatchObject({
			cardUid: UID,
			subscriberId: 42,
			deviceId: 'reader-1',
			eventType: 'entry',
			offlineQueued: false,
			validated: true,
			queuePending: 3,
			storageFreePercent: 80
		});
	});

	it('stores null queue fields when queue_status is omitted', async () => {
		await processSingleAttendance([event(minutesFromNow(0))], 'reader-1');
		expect(state.current.inserts[0].values).toMatchObject({
			queuePending: null,
			storageFreePercent: null
		});
	});

	it('uses the last stored event to alternate entry/exit', async () => {
		state.current.lastEvent = { eventType: 'entry', readTimestamp: new Date() };
		const result = await processSingleAttendance([event(minutesFromNow(0))], 'reader-1');
		expect(result.actions[0].type).toBe('exit');
	});

	it('rejects unknown cards with rejection_reason and no insert', async () => {
		state.current.cardRow = undefined;
		const result = await processSingleAttendance([event(minutesFromNow(0))], 'reader-1');

		expect(result).toMatchObject({ accepted: 0, rejected: 1 });
		expect(result.actions).toEqual([
			{ uid: UID, action: 'unknown', type: 'entry', rejection_reason: 'unknown_card' }
		]);
		expect(state.current.inserts).toHaveLength(0);
	});

	it('rejects swipes outside the course date range', async () => {
		state.current.inCourse = false;
		const result = await processSingleAttendance([event(minutesFromNow(0))], 'reader-1');
		expect(result.actions[0].rejection_reason).toBe('course_date_out_of_range');
	});

	it('rejects timestamps outside the ±30 day tolerance', async () => {
		const result = await processSingleAttendance(
			[event(minutesFromNow(-31 * 24 * 60))],
			'reader-1'
		);
		expect(result.actions[0].rejection_reason).toBe('timestamp_out_of_range');
	});

	it('ignores swipes within the minimum interval without counting them', async () => {
		state.current.recentSwipe = true;
		const result = await processSingleAttendance([event(minutesFromNow(0))], 'reader-1');

		expect(result).toMatchObject({ accepted: 0, rejected: 0 });
		expect(result.actions).toEqual([
			{
				uid: UID,
				action: 'ignored',
				user_name: 'Mario Rossi',
				type: 'entry',
				ignored_reason: 'min_interval_15min'
			}
		]);
		expect(state.current.inserts).toHaveLength(0);
	});

	it('records staff cards in staff_attendance', async () => {
		state.current.cardRow = staffCard();
		const result = await processSingleAttendance([event(minutesFromNow(0))], 'reader-1');

		expect(result.actions).toEqual([
			{ uid: UID, action: 'confirm', user_name: 'Giulia Bianchi', type: 'entry' }
		]);
		expect(state.current.inserts[0].table).toBe(staffAttendance);
		expect(state.current.inserts[0].values).toMatchObject({
			userId: 7,
			source: 'card',
			isBackdated: false,
			offlineQueued: false
		});
	});
});

describe('processBatchAttendance', () => {
	it('alternates entry/exit across events of the same batch and marks them offline', async () => {
		const result = await processBatchAttendance(
			[event(minutesFromNow(-60)), event(minutesFromNow(-30))],
			'reader-1',
			BATCH_INFO,
			QUEUE
		);

		expect(Object.keys(result).sort()).toEqual([
			'accepted',
			'actions',
			'rejected',
			'results',
			'server_time'
		]);
		expect(result).toMatchObject({ accepted: 2, rejected: 0, results: [] });
		expect(result.actions.map((a) => a.type)).toEqual(['entry', 'exit']);
		expect(state.current.inserts.map((i) => i.values.offlineQueued)).toEqual([true, true]);
	});

	it('ignores a second swipe within the minimum interval inside the same batch', async () => {
		const result = await processBatchAttendance(
			[event(minutesFromNow(-10)), event(minutesFromNow(-5))],
			'reader-1',
			BATCH_INFO,
			QUEUE
		);

		expect(result).toMatchObject({ accepted: 1, rejected: 0 });
		expect(result.actions[1]).toEqual({
			uid: UID,
			action: 'ignored',
			user_name: 'Mario Rossi',
			type: 'exit',
			ignored_reason: 'min_interval_15min'
		});
		expect(state.current.inserts).toHaveLength(1);
	});

	it('reports rejected events in results with their index', async () => {
		state.current.inCourse = false;
		const result = await processBatchAttendance(
			[event(minutesFromNow(-60))],
			'reader-1',
			BATCH_INFO,
			QUEUE
		);

		expect(result).toMatchObject({ accepted: 0, rejected: 1 });
		expect(result.results).toEqual([{ index: 0, status: 400, reason: 'course_date_out_of_range' }]);
		expect(result.actions).toEqual([
			{ uid: UID, action: 'unknown', type: 'entry', rejection_reason: 'course_date_out_of_range' }
		]);
	});
});
