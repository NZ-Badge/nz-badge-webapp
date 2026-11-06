import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/db', () => ({ db: {} }));

import {
	buildSubscriberCourseAttendanceSummary,
	getEnrollmentAttendancePeriod
} from '$lib/services/subscriber-course-attendance';
import {
	buildResolutionLimits,
	getHoursFieldName,
	parseHours,
	validateAnomalyResolutions
} from './attendance-anomalies';

const enrollment = {
	id: 1,
	productTitle: 'Corso',
	variantTitle: null,
	startDate: '2026-10-01',
	endDate: '2026-10-31'
};

function row(id: number, eventType: 'entry' | 'exit', iso: string) {
	return {
		id,
		cardUid: 'AA:BB:CC:DD',
		uidRaw: null,
		subscriberId: 42,
		deviceId: 'reader-1',
		eventType,
		readTimestamp: new Date(iso)
	};
}

// Two entries in a row: the first misses its exit and is resolvable.
const allAttendance = [
	row(10, 'entry', '2026-10-05T07:00:00.000Z'),
	row(11, 'entry', '2026-10-05T12:00:00.000Z'),
	row(12, 'exit', '2026-10-05T15:00:00.000Z')
];

function context() {
	return {
		allAttendance,
		summary: buildSubscriberCourseAttendanceSummary(enrollment, allAttendance),
		period: getEnrollmentAttendancePeriod(enrollment)
	};
}

describe('attendance anomaly resolution', () => {
	it('parses hours with comma decimals', () => {
		expect(parseHours(' 2,5 ')).toBe(2.5);
		expect(parseHours('')).toBeNull();
		expect(parseHours('abc')).toBeNull();
		expect(parseHours(null)).toBeNull();
	});

	it('limits the hours to the next recorded event', () => {
		const [issue] = context().summary.resolvableIssues;
		expect(buildResolutionLimits(issue, context().period!.end)).toEqual({
			maxMinutes: 299,
			maxHours: 4.98
		});
	});

	it('computes the exit for valid hours', () => {
		const field = getHoursFieldName(10);
		const result = validateAnomalyResolutions(context(), (name) => (name === field ? '3' : null));

		expect(result).toMatchObject({
			status: 'valid',
			resolutions: [
				{
					entryId: 10,
					durationMinutes: 180,
					exitAt: new Date('2026-10-05T10:00:00.000Z'),
					cardUid: 'AA:BB:CC:DD',
					subscriberId: 42
				}
			]
		});
	});

	it('reports field errors in Italian and keeps the submitted values', () => {
		const field = getHoursFieldName(10);
		const result = validateAnomalyResolutions(context(), () => '6');

		expect(result).toEqual({
			status: 'invalid',
			fieldErrors: { [field]: 'Il massimo consentito per questo ingresso è 4.98 ore.' },
			values: { [field]: '6' }
		});
	});

	it('refuses enrollments without a valid period', () => {
		const noPeriod = { ...enrollment, endDate: null };
		const result = validateAnomalyResolutions(
			{
				allAttendance,
				summary: buildSubscriberCourseAttendanceSummary(noPeriod, allAttendance),
				period: getEnrollmentAttendancePeriod(noPeriod)
			},
			() => '1'
		);
		expect(result).toEqual({ status: 'no_period' });
	});

	it('limits the exit to the course days of a non-contiguous course', () => {
		const nonContiguous = {
			...enrollment,
			scheduleDays: ['2026-10-05', '2026-10-07']
		};
		const rows = [row(20, 'entry', '2026-10-05T20:00:00.000Z')];
		const ctx = {
			allAttendance: rows,
			enrollment: nonContiguous,
			summary: buildSubscriberCourseAttendanceSummary(nonContiguous, rows),
			period: getEnrollmentAttendancePeriod(nonContiguous)
		};
		const field = getHoursFieldName(20);

		// 2026-10-05 ends at 22:00Z (midnight Europe/Rome): at most 1h59.
		expect(validateAnomalyResolutions(ctx, () => '3')).toEqual({
			status: 'invalid',
			fieldErrors: { [field]: 'Il massimo consentito per questo ingresso è 1.98 ore.' },
			values: { [field]: '3' }
		});
		expect(validateAnomalyResolutions(ctx, () => '1')).toMatchObject({ status: 'valid' });
		// Same entry in a contiguous course may run until the 24h cap.
		expect(validateAnomalyResolutions({ ...ctx, enrollment }, () => '3')).toMatchObject({
			status: 'valid'
		});
	});
});
