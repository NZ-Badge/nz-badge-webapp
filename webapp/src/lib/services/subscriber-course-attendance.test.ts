import { describe, expect, it } from 'vitest';
import {
	buildSubscriberCourseAttendanceReportRows,
	buildSubscriberCourseAttendanceSummaries,
	getEnrollmentCourseBlockEnd,
	getEnrollmentCourseState
} from '$lib/services/subscriber-course-attendance';

describe('buildSubscriberCourseAttendanceSummaries', () => {
	it('calculates hours only inside the enrollment start/end dates in Europe/Rome', () => {
		const [summary] = buildSubscriberCourseAttendanceSummaries(
			[
				{
					id: 10,
					productTitle: 'Pilates',
					variantTitle: 'Aprile 2026',
					startDate: '2026-04-11',
					endDate: '2026-04-12'
				}
			],
			[
				{ id: 1, eventType: 'entry', readTimestamp: '2026-04-10T09:00:00Z' },
				{ id: 2, eventType: 'exit', readTimestamp: '2026-04-10T10:00:00Z' },
				{ id: 3, eventType: 'entry', readTimestamp: '2026-04-10T22:30:00Z' },
				{ id: 4, eventType: 'exit', readTimestamp: '2026-04-10T23:30:00Z' },
				{ id: 5, eventType: 'entry', readTimestamp: '2026-04-11T10:00:00Z' },
				{ id: 6, eventType: 'exit', readTimestamp: '2026-04-11T13:00:00Z' },
				{ id: 7, eventType: 'entry', readTimestamp: '2026-05-02T09:00:00Z' },
				{ id: 8, eventType: 'exit', readTimestamp: '2026-05-02T10:00:00Z' }
			]
		);

		expect(summary.periodLabel).toBe('11/04/2026 - 12/04/2026');
		expect(summary.totalMinutes).toBe(240);
		expect(summary.totalLabel).toBe('4h');
		expect(summary.validSessions).toBe(2);
		expect(summary.issues).toHaveLength(0);
	});

	it('does not calculate when the enrollment has no endDate', () => {
		const [summary] = buildSubscriberCourseAttendanceSummaries(
			[
				{
					id: 11,
					productTitle: 'Yoga',
					variantTitle: 'Sessione individuale',
					startDate: '2026-04-15'
				}
			],
			[
				{ id: 1, eventType: 'entry', readTimestamp: '2026-04-15T09:00:00+02:00' },
				{ id: 2, eventType: 'exit', readTimestamp: '2026-04-15T11:00:00+02:00' }
			]
		);

		expect(summary.canCalculate).toBe(false);
		expect(summary.totalLabel).toBe('—');
		expect(summary.issues).toEqual([
			{
				type: 'missing_course_date',
				message: 'Data corso mancante',
				timestamp: null
			}
		]);
	});

	it('builds export report rows from the same course attendance summary calculation', () => {
		const [row] = buildSubscriberCourseAttendanceReportRows([
			{
				subscriberId: 7,
				firstName: 'Mario',
				lastName: 'Rossi',
				email: 'mario@example.com',
				enrollments: [
					{
						id: 12,
						productTitle: 'Pilates',
						variantTitle: 'Maggio 2026',
						startDate: '2026-05-01',
						endDate: '2026-05-02'
					}
				],
				attendanceRows: [
					{ id: 1, eventType: 'entry', readTimestamp: '2026-05-01T08:00:00Z' },
					{ id: 2, eventType: 'exit', readTimestamp: '2026-05-01T10:00:00Z' },
					{ id: 3, eventType: 'entry', readTimestamp: '2026-05-01T11:00:00Z' }
				]
			}
		]);

		expect(row).toMatchObject({
			subscriberId: 7,
			enrollmentId: 12,
			name: 'Mario Rossi',
			email: 'mario@example.com',
			course: 'Pilates - Maggio 2026',
			totalMinutes: 120,
			totalLabel: '2h',
			anomalyCount: 1
		});
	});
});

describe('getEnrollmentCourseState', () => {
	// 25/09/2026 00:30 a Roma, ancora 24/09 in UTC
	const now = new Date('2026-09-24T22:30:00Z');

	it('marks as expired only courses ended before today in Europe/Rome', () => {
		expect(getEnrollmentCourseState('2026-09-24', now)).toBe('expired');
		expect(getEnrollmentCourseState(new Date('2026-09-24T00:00:00Z'), now)).toBe('expired');
		expect(getEnrollmentCourseState('2026-09-25', now)).toBe('active');
		expect(getEnrollmentCourseState('2026-10-31', now)).toBe('active');
	});

	it('keeps courses without end date active', () => {
		expect(getEnrollmentCourseState(null, now)).toBe('active');
	});
});

describe('non-contiguous courses', () => {
	const nonContiguous = {
		id: 20,
		productTitle: 'Mosaico',
		variantTitle: null,
		startDate: '2026-06-15',
		endDate: '2026-06-22',
		scheduleDays: ['2026-06-15', '2026-06-16', '2026-06-22']
	};
	const swipes = [
		{ id: 1, eventType: 'entry' as const, readTimestamp: '2026-06-15T07:00:00Z' },
		{ id: 2, eventType: 'exit' as const, readTimestamp: '2026-06-15T09:00:00Z' },
		{ id: 3, eventType: 'entry' as const, readTimestamp: '2026-06-17T07:00:00Z' },
		{ id: 4, eventType: 'exit' as const, readTimestamp: '2026-06-17T12:00:00Z' },
		{ id: 5, eventType: 'entry' as const, readTimestamp: '2026-06-22T07:00:00Z' },
		{ id: 6, eventType: 'exit' as const, readTimestamp: '2026-06-22T08:00:00Z' }
	];

	it('counts only the swipes on the course days', () => {
		const [summary] = buildSubscriberCourseAttendanceSummaries([nonContiguous], swipes);
		expect(summary.totalMinutes).toBe(180);
		expect(summary.eventCount).toBe(4);
		expect(summary.periodLabel).toBe('15/06/2026 - 22/06/2026 (3 giornate)');
	});

	it('keeps counting the whole range for contiguous courses', () => {
		for (const scheduleDays of [undefined, null, []]) {
			const [summary] = buildSubscriberCourseAttendanceSummaries(
				[{ ...nonContiguous, scheduleDays }],
				swipes
			);
			expect(summary.totalMinutes).toBe(480);
			expect(summary.periodLabel).toBe('15/06/2026 - 22/06/2026');
		}
	});

	it('ends a course block after the last consecutive course day', () => {
		expect(getEnrollmentCourseBlockEnd(nonContiguous, '2026-06-15T07:00:00Z')).toBe(
			new Date('2026-06-16T22:00:00Z').getTime()
		);
		expect(getEnrollmentCourseBlockEnd(nonContiguous, '2026-06-22T07:00:00Z')).toBe(
			new Date('2026-06-22T22:00:00Z').getTime()
		);
		// Capped at the course end date even if listed days go past it.
		expect(
			getEnrollmentCourseBlockEnd(
				{ ...nonContiguous, scheduleDays: ['2026-06-22', '2026-06-23'] },
				'2026-06-22T07:00:00Z'
			)
		).toBe(new Date('2026-06-22T22:00:00Z').getTime());
		const { scheduleDays: _ignored, ...contiguous } = nonContiguous;
		void _ignored;
		expect(getEnrollmentCourseBlockEnd(contiguous, '2026-06-15T07:00:00Z')).toBe(
			new Date('2026-06-22T22:00:00Z').getTime()
		);
	});
});
