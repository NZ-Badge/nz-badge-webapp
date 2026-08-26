import type { PageServerLoad } from './$types';
import {
	getCurrentMonthDateRange,
	getStaffAttendanceReport,
	normalizeStaffAttendanceRange
} from '$lib/services/staff-attendance';

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = await locals.verifyUser();
	const monthRange = getCurrentMonthDateRange();
	const range = normalizeStaffAttendanceRange(
		url.searchParams.get('from'),
		url.searchParams.get('to'),
		monthRange
	);
	const report = await getStaffAttendanceReport(user.id, range);

	return {
		targetUser: { id: user.id, name: user.name, email: user.email },
		report,
		from: range.from,
		to: range.to,
		manualUsers: [{ id: user.id, name: user.name, email: user.email }]
	};
};
