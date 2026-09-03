import { describe, expect, it } from 'vitest';
import {
	parseSubscriberAttendanceDateTime,
	SubscriberAttendanceAdminError
} from './subscriber-attendance-admin';

describe('subscriber attendance administration', () => {
	it('interprets the editor value in the Europe/Rome timezone', () => {
		expect(parseSubscriberAttendanceDateTime('2026-09-03T14:30').toISOString()).toBe(
			'2026-09-03T12:30:00.000Z'
		);
	});

	it.each(['', '2026-09-03', '03/09/2026 14:30', 'not-a-date'])(
		'rejects an invalid local timestamp: %s',
		(value) => {
			expect(() => parseSubscriberAttendanceDateTime(value)).toThrow(
				SubscriberAttendanceAdminError
			);
		}
	);
});
