import { describe, expect, it } from 'vitest';
import { getStaffCardRejectionReason } from './attendance';
import {
	buildStaffAttendanceReport,
	determineNextStaffEventTypeFromPrevious,
	getCurrentMonthDateRange,
	getCurrentWeekDateRange,
	isManualAttendanceBackdated,
	summarizeStaffAttendancePeriod
} from './staff-attendance';

describe('staff attendance validation', () => {
	it('does not require an enrollment or course range', () => {
		expect(getStaffCardRejectionReason(true, true)).toBeNull();
		expect(getStaffCardRejectionReason(false, true)).toBe('unknown_card');
		expect(getStaffCardRejectionReason(true, false)).toBe('timestamp_out_of_range');
	});

	it('alternates across sources by previous user event and resets on a new Rome day', () => {
		expect(determineNextStaffEventTypeFromPrevious(null, '2026-08-26T08:00:00Z', true)).toBe(
			'entry'
		);
		expect(
			determineNextStaffEventTypeFromPrevious(
				{ eventType: 'entry', readTimestamp: '2026-08-26T08:00:00Z' },
				'2026-08-26T15:00:00Z',
				true
			)
		).toBe('exit');
		expect(
			determineNextStaffEventTypeFromPrevious(
				{ eventType: 'entry', readTimestamp: '2026-08-26T20:30:00Z' },
				'2026-08-27T06:00:00Z',
				true
			)
		).toBe('entry');
		expect(
			determineNextStaffEventTypeFromPrevious(
				{ eventType: 'entry', readTimestamp: '2026-08-26T20:30:00Z' },
				'2026-08-27T06:00:00Z',
				false
			)
		).toBe('exit');
	});

	it('marks only prior-minute manual inserts as backdated', () => {
		const now = new Date('2026-08-26T10:15:45Z');
		expect(isManualAttendanceBackdated(new Date('2026-08-26T10:15:00Z'), now)).toBe(false);
		expect(isManualAttendanceBackdated(new Date('2026-08-26T10:14:59Z'), now)).toBe(true);
	});
});

describe('staff attendance hour reports', () => {
	const rows = [
		{ id: 1, eventType: 'entry' as const, readTimestamp: '2026-08-03T20:30:00Z' },
		{ id: 2, eventType: 'exit' as const, readTimestamp: '2026-08-04T00:30:00Z' },
		{ id: 3, eventType: 'entry' as const, readTimestamp: '2026-08-05T07:00:00Z' },
		{ id: 4, eventType: 'exit' as const, readTimestamp: '2026-08-05T09:00:00Z' },
		{ id: 5, eventType: 'entry' as const, readTimestamp: '2026-08-06T07:00:00Z' }
	];

	it('attributes an overnight session to the Rome date of its entry and counts it in full', () => {
		const augustThird = summarizeStaffAttendancePeriod(rows, {
			from: '2026-08-03',
			to: '2026-08-03'
		});
		expect(augustThird.totalMinutes).toBe(240);
		expect(augustThird.validSessions).toBe(1);
	});

	it('excludes incomplete pairs from total and exposes the anomaly', () => {
		const range = summarizeStaffAttendancePeriod(rows, {
			from: '2026-08-05',
			to: '2026-08-06'
		});
		expect(range.totalMinutes).toBe(120);
		expect(range.issues).toHaveLength(1);
		expect(range.issues[0].type).toBe('missing_exit');
	});

	it('builds Monday-Sunday and calendar-month totals in Europe/Rome', () => {
		const now = new Date('2026-08-05T10:00:00Z');
		expect(getCurrentWeekDateRange(now)).toEqual({ from: '2026-08-03', to: '2026-08-09' });
		expect(getCurrentMonthDateRange(now)).toEqual({ from: '2026-08-01', to: '2026-08-31' });
		const report = buildStaffAttendanceReport(rows, { from: '2026-08-01', to: '2026-08-31' }, now);
		expect(report.week.totalMinutes).toBe(360);
		expect(report.month.totalMinutes).toBe(360);
		expect(report.custom.totalMinutes).toBe(360);
	});
});
