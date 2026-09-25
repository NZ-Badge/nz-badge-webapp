import type { PageServerLoad } from './$types';
import { requirePageUser } from '$lib/services/auth';
import { count, desc, eq } from 'drizzle-orm';
import { db } from '$lib/db';
import { staffAttendance } from '$lib/db/schema';
import {
	getCurrentMonthDateRange,
	getStaffAttendanceReport,
	normalizeStaffAttendanceRange
} from '$lib/services/staff-attendance';
import { clampPagination, parsePagination } from '$lib/utils/pagination';

const PAGE_SIZE = 50;

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = await requirePageUser(locals);
	const monthRange = getCurrentMonthDateRange();
	const range = normalizeStaffAttendanceRange(
		url.searchParams.get('from'),
		url.searchParams.get('to'),
		monthRange
	);
	const report = await getStaffAttendanceReport(user.id, range);
	const requested = parsePagination(url, PAGE_SIZE);
	const [{ total }] = await db
		.select({ total: count() })
		.from(staffAttendance)
		.where(eq(staffAttendance.userId, user.id));
	const totalPages = Math.ceil(total / PAGE_SIZE);
	const { page, offset } = clampPagination(requested, total);
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
		.limit(PAGE_SIZE)
		.offset(offset);

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
