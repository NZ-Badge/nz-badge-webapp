import { describe, expect, it } from 'vitest';
import { buildSubscriberCourseAttendanceSummaries } from '$lib/services/subscriber-course-attendance';

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
});
