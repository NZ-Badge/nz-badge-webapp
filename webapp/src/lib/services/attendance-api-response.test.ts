import { describe, expect, it } from 'vitest';
import {
	createRejectedAttendanceAction,
	type AttendanceRejectionReason
} from '$lib/services/attendance';
import { multiStatus, ok } from '$lib/utils/api';

const REJECTION_REASONS: AttendanceRejectionReason[] = [
	'unknown_card',
	'timestamp_out_of_range',
	'course_date_out_of_range'
];

describe('attendance rejection response contract', () => {
	it.each(REJECTION_REASONS)(
		'preserves the existing unknown action and adds rejection_reason=%s',
		(rejectionReason) => {
			const action = createRejectedAttendanceAction('FE:B2:25:07', 'entry', rejectionReason);

			expect(action).toEqual({
				uid: 'FE:B2:25:07',
				action: 'unknown',
				type: 'entry',
				rejection_reason: rejectionReason
			});
		}
	);

	it('serializes rejection_reason in the existing single-attendance response envelope', async () => {
		const action = createRejectedAttendanceAction(
			'FE:B2:25:07',
			'entry',
			'course_date_out_of_range'
		);
		const response = ok({
			accepted: 0,
			rejected: 1,
			server_time: '2026-08-25T15:09:57.000+02:00',
			actions: [action]
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			success: true,
			data: {
				accepted: 0,
				rejected: 1,
				server_time: '2026-08-25T15:09:57.000+02:00',
				actions: [action]
			}
		});
	});

	it('keeps batch results and also serializes rejection_reason in actions', async () => {
		const action = createRejectedAttendanceAction(
			'FE:B2:25:07',
			'entry',
			'course_date_out_of_range'
		);
		const response = multiStatus({
			accepted: 0,
			rejected: 1,
			server_time: '2026-08-25T15:09:57.000+02:00',
			results: [{ index: 0, status: 400, reason: 'course_date_out_of_range' }],
			actions: [action]
		});

		expect(response.status).toBe(207);
		expect(await response.json()).toEqual({
			success: true,
			accepted: 0,
			rejected: 1,
			server_time: '2026-08-25T15:09:57.000+02:00',
			results: [{ index: 0, status: 400, reason: 'course_date_out_of_range' }],
			actions: [action]
		});
	});
});
