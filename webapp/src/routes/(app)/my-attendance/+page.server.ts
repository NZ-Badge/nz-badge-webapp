import type { PageServerLoad } from './$types';
import { count, desc, eq } from 'drizzle-orm';
import { db } from '$lib/db';
import { staffAttendance } from '$lib/db/schema';
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
	const pageSize = 50;
	const requestedPage = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
	const [{ total }] = await db
		.select({ total: count() })
		.from(staffAttendance)
		.where(eq(staffAttendance.userId, user.id));
	const totalPages = Math.ceil(total / pageSize);
	const page = Math.min(requestedPage, Math.max(1, totalPages));
	const swipes = await db
		.select({
			id: staffAttendance.id,
			eventType: staffAttendance.eventType,
			readTimestamp: staffAttendance.readTimestamp,
			source: staffAttendance.source,
			isBackdated: staffAttendance.isBackdated
		})
		.from(staffAttendance)
		.where(eq(staffAttendance.userId, user.id))
		.orderBy(desc(staffAttendance.readTimestamp), desc(staffAttendance.id))
		.limit(pageSize)
		.offset((page - 1) * pageSize);

	return {
		targetUser: { id: user.id, name: user.name, email: user.email },
		report,
		from: range.from,
		to: range.to,
		swipes,
		page,
		totalPages,
		total,
		manualUsers: [{ id: user.id, name: user.name, email: user.email }]
	};
};
