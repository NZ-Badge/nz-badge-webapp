import { describe, expect, it, vi } from 'vitest';
import { getAttendanceRejectionReason } from '$lib/services/attendance';

const validCardEvent = {
	cardActive: true,
	subscriberId: 42,
	withinTolerance: true,
	timestamp: '2026-09-03T09:00:00+02:00'
};

describe('optional subscriber course-date validation', () => {
	it('accepts the event without querying enrollments when the rule is disabled', async () => {
		const courseRangeLookup = vi.fn(async () => false);

		const rejectionReason = await getAttendanceRejectionReason(
			{ ...validCardEvent, enforceCourseDateRange: false },
			courseRangeLookup
		);

		expect(rejectionReason).toBeNull();
		expect(courseRangeLookup).not.toHaveBeenCalled();
	});

	it('rejects an event outside all enrollment ranges when the rule is enabled', async () => {
		const courseRangeLookup = vi.fn(async () => false);

		const rejectionReason = await getAttendanceRejectionReason(
			{ ...validCardEvent, enforceCourseDateRange: true },
			courseRangeLookup
		);

		expect(rejectionReason).toBe('course_date_out_of_range');
		expect(courseRangeLookup).toHaveBeenCalledOnce();
	});

	it('accepts an event inside an enrollment range when the rule is enabled', async () => {
		const rejectionReason = await getAttendanceRejectionReason(
			{ ...validCardEvent, enforceCourseDateRange: true },
			async () => true
		);

		expect(rejectionReason).toBeNull();
	});
});
