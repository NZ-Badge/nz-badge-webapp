import type { PageServerLoad } from './$types';
import { and, count, desc, eq, gte, like, lt, sql } from 'drizzle-orm';
import { db } from '$lib/db';
import { staffAttendance, users } from '$lib/db/schema';
import { isStaffManager, requirePageStaff } from '$lib/services/auth';
import { getCurrentMonthDateRange } from '$lib/services/staff-attendance';
import { addDaysToDateKey, isDateKey, romeDayStart } from '$lib/utils/date';
import { parsePagination } from '$lib/utils/pagination';

const PAGE_SIZE = 50;

export const load: PageServerLoad = async ({ locals, url }) => {
	const actor = await requirePageStaff(locals);
	const canManage = isStaffManager(actor);
	const exportDefaultRange = getCurrentMonthDateRange();
	const { page, offset } = parsePagination(url, PAGE_SIZE);
	const rawFrom = url.searchParams.get('from') ?? '';
	const rawTo = url.searchParams.get('to') ?? '';
	const from = isDateKey(rawFrom) ? rawFrom : '';
	const to = isDateKey(rawTo) ? rawTo : '';
	const userQuery = canManage ? (url.searchParams.get('user') ?? '').trim().slice(0, 100) : '';
	const device = (url.searchParams.get('device') ?? '').trim().slice(0, 50);
	const rawSource = url.searchParams.get('source') ?? '';
	const source = ['card', 'manual', 'simulation'].includes(rawSource)
		? (rawSource as 'card' | 'manual' | 'simulation')
		: '';

	const filters = [];
	if (!canManage) filters.push(eq(staffAttendance.userId, actor.id));
	if (from) {
		filters.push(gte(staffAttendance.readTimestamp, romeDayStart(from)));
	}
	if (to) {
		filters.push(lt(staffAttendance.readTimestamp, romeDayStart(addDaysToDateKey(to, 1))));
	}
	if (userQuery) {
		filters.push(sql`CONCAT(${users.name}, ' ', ${users.email}) LIKE ${`%${userQuery}%`}`);
	}
	if (device) filters.push(like(staffAttendance.deviceId, `%${device}%`));
	if (source) filters.push(eq(staffAttendance.source, source));
	const whereClause = filters.length ? and(...filters) : undefined;

	const [rows, [{ total }], activeUsers] = await Promise.all([
		db
			.select({
				id: staffAttendance.id,
				userId: staffAttendance.userId,
				userName: users.name,
				userEmail: users.email,
				cardUid: staffAttendance.cardUid,
				deviceId: staffAttendance.deviceId,
				eventType: staffAttendance.eventType,
				readTimestamp: staffAttendance.readTimestamp,
				offlineQueued: staffAttendance.offlineQueued,
				source: staffAttendance.source,
				isBackdated: staffAttendance.isBackdated,
				note: staffAttendance.note
			})
			.from(staffAttendance)
			.innerJoin(users, eq(staffAttendance.userId, users.id))
			.where(whereClause)
			.orderBy(desc(staffAttendance.readTimestamp), desc(staffAttendance.id))
			.limit(PAGE_SIZE)
			.offset(offset),
		db
			.select({ total: count() })
			.from(staffAttendance)
			.innerJoin(users, eq(staffAttendance.userId, users.id))
			.where(whereClause),
		canManage
			? db
					.select({ id: users.id, name: users.name, email: users.email })
					.from(users)
					.where(eq(users.status, 'active'))
					.orderBy(users.name)
			: Promise.resolve([{ id: actor.id, name: actor.name, email: actor.email }])
	]);

	return {
		rows,
		total,
		page,
		totalPages: Math.ceil(total / PAGE_SIZE),
		from,
		to,
		userQuery,
		device,
		source,
		actorId: actor.id,
		canManage,
		activeUsers,
		exportUsers: activeUsers.map((user) => ({ name: user.name, email: user.email })),
		exportDefaultRange
	};
};
