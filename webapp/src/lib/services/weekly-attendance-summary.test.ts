import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	sendMail: vi.fn(),
	selectResults: [] as unknown[][],
	inserts: [] as Record<string, unknown>[],
	updates: [] as Record<string, unknown>[],
	insertError: null as unknown,
	updateAffectedRows: 1
}));

vi.mock('./settings-schema', () => ({
	readSettings: async () => ({ weekly_attendance_summary_enabled: true })
}));
vi.mock('nodemailer', () => ({
	default: { createTransport: () => ({ sendMail: mocks.sendMail }) }
}));

import { sendWeeklyAttendanceSummaries } from './weekly-attendance-summary';
import { buildWeeklySummaryEmail } from './weekly-attendance-summary-email';

function chain(result: unknown[]) {
	const query = {
		from: () => query,
		innerJoin: () => query,
		where: () => query,
		orderBy: () => Promise.resolve(result),
		then: (resolve: (value: unknown[]) => unknown, reject: (err: unknown) => unknown) =>
			Promise.resolve(result).then(resolve, reject)
	};
	return query;
}

const database = {
	select: () => chain(mocks.selectResults.shift() ?? []),
	insert: () => ({
		values: async (values: Record<string, unknown>) => {
			if (mocks.insertError) throw mocks.insertError;
			mocks.inserts.push(values);
			return [{ insertId: 42 }];
		}
	}),
	update: () => ({
		set: (values: Record<string, unknown>) => ({
			where: async () => {
				mocks.updates.push(values);
				return [{ affectedRows: mocks.updateAffectedRows }];
			}
		})
	})
} as unknown as Parameters<typeof sendWeeklyAttendanceSummaries>[0];

const SATURDAY = new Date('2026-09-26T10:00:00.000Z');
const ENV = { SMTP_HOST: 'smtp.test', MAIL_FROM: 'noreply@example.test' };
const weekRow = {
	id: 1,
	eventType: 'entry' as const,
	readTimestamp: new Date('2026-09-22T07:00:00.000Z'),
	subscriberId: 7,
	subscriberFirstName: 'Mario',
	subscriberLastName: 'Rossi',
	subscriberEmail: 'mario@example.test'
};

function queueRun(existingLogs: unknown[] = []) {
	mocks.selectResults = [[weekRow], existingLogs, [weekRow]];
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.inserts = [];
	mocks.updates = [];
	mocks.insertError = null;
	mocks.updateAffectedRows = 1;
	mocks.sendMail.mockResolvedValue({});
});

describe('sendWeeklyAttendanceSummaries', () => {
	it('reserves a pending row before sending and then marks it sent', async () => {
		queueRun();
		mocks.sendMail.mockImplementation(async () => {
			expect(mocks.inserts).toEqual([expect.objectContaining({ status: 'pending' })]);
			return {};
		});

		const result = await sendWeeklyAttendanceSummaries(database, {
			referenceDate: SATURDAY,
			env: ENV
		});

		expect(result).toMatchObject({ status: 'completed', sent: 1, errors: 0, skipped: 0 });
		expect(mocks.sendMail).toHaveBeenCalledTimes(1);
		expect(mocks.updates).toEqual([expect.objectContaining({ status: 'sent' })]);
	});

	it('does not send when another run already reserved the row', async () => {
		queueRun();
		mocks.insertError = Object.assign(new Error('Failed query'), {
			cause: { code: 'ER_DUP_ENTRY' }
		});

		const result = await sendWeeklyAttendanceSummaries(database, {
			referenceDate: SATURDAY,
			env: ENV
		});

		expect(result).toMatchObject({ sent: 0, skipped: 1, errors: 0 });
		expect(mocks.sendMail).not.toHaveBeenCalled();
	});

	it('skips sent and pending rows, and retries errors only if still in error', async () => {
		queueRun([{ id: 3, subscriberId: 7, status: 'pending' }]);
		let result = await sendWeeklyAttendanceSummaries(database, {
			referenceDate: SATURDAY,
			env: ENV
		});
		expect(result).toMatchObject({ sent: 0, skipped: 1 });

		queueRun([{ id: 3, subscriberId: 7, status: 'error' }]);
		mocks.updateAffectedRows = 0;
		result = await sendWeeklyAttendanceSummaries(database, { referenceDate: SATURDAY, env: ENV });
		expect(result).toMatchObject({ sent: 0, skipped: 1 });
		expect(mocks.sendMail).not.toHaveBeenCalled();
	});

	it('records a failed send as error', async () => {
		queueRun([{ id: 3, subscriberId: 7, status: 'error' }]);
		mocks.sendMail.mockRejectedValue(new Error('SMTP down'));

		const result = await sendWeeklyAttendanceSummaries(database, {
			referenceDate: SATURDAY,
			env: ENV
		});

		expect(result).toMatchObject({ sent: 0, errors: 1 });
		expect(mocks.updates).toEqual([
			expect.objectContaining({ status: 'pending' }),
			expect.objectContaining({ status: 'error', errorMsg: 'SMTP down' })
		]);
	});

	it('writes nothing in dry-run mode', async () => {
		queueRun();
		const result = await sendWeeklyAttendanceSummaries(database, {
			referenceDate: SATURDAY,
			dryRun: true
		});
		expect(result).toMatchObject({ sent: 1 });
		expect(mocks.inserts).toEqual([]);
		expect(mocks.updates).toEqual([]);
		expect(mocks.sendMail).not.toHaveBeenCalled();
	});
});

describe('buildWeeklySummaryEmail', () => {
	it('escapes the recipient name in the HTML body', () => {
		const email = buildWeeklySummaryEmail({
			subscriber: { firstName: '<b>Mario</b>', lastName: 'Rossi' },
			weekStartDate: '2026-09-21',
			weekEndDate: '2026-09-25',
			weekRows: [],
			totalRows: []
		});
		expect(email.subject).toBe('Riepilogo presenze 21/09/2026 - 25/09/2026');
		expect(email.html).toContain('&lt;b&gt;Mario&lt;/b&gt;');
		expect(email.text).toContain('Nessuna strisciata valida');
	});
});
