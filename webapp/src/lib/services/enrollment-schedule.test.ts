import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/db', () => ({ db: {} }));

import { normalizeEnrollmentSchedule } from './enrollment-schedule';

describe('normalizeEnrollmentSchedule', () => {
	it.each([undefined, null, ''])(
		'leaves the schedule unchanged when scheduleMode is %s',
		(mode) => {
			expect(normalizeEnrollmentSchedule({ scheduleMode: mode })).toBeNull();
		}
	);

	it('ignores days for contiguous courses', () => {
		expect(
			normalizeEnrollmentSchedule({
				scheduleMode: 'CONTIGUOUS',
				scheduleDays: [{ date: '2026-06-15' }]
			})
		).toEqual({ mode: 'CONTIGUOUS', days: [] });
	});

	it('sorts and deduplicates the days of non-contiguous courses', () => {
		expect(
			normalizeEnrollmentSchedule({
				scheduleMode: 'NON_CONTIGUOUS_CUSTOM',
				scheduleDays: [{ date: '2026-06-22' }, { date: '2026-06-15' }, { date: '2026-06-22' }]
			})
		).toEqual({ mode: 'NON_CONTIGUOUS_CUSTOM', days: ['2026-06-15', '2026-06-22'] });
	});

	it('requires days for non-contiguous courses', () => {
		expect(() =>
			normalizeEnrollmentSchedule({ scheduleMode: 'NON_CONTIGUOUS', scheduleDays: [] })
		).toThrow(/scheduleDays/);
	});

	it('rejects unknown modes and malformed dates', () => {
		expect(() => normalizeEnrollmentSchedule({ scheduleMode: 'WEEKLY' })).toThrow();
		expect(() =>
			normalizeEnrollmentSchedule({
				scheduleMode: 'NON_CONTIGUOUS',
				scheduleDays: [{ date: '2026-02-30' }]
			})
		).toThrow(/2026-02-30/);
	});
});
