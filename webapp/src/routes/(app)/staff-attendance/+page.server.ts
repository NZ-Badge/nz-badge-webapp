import type { PageServerLoad } from './$types';
import { and, count, desc, eq, gte, like, lt, sql } from 'drizzle-orm';
import { fromZonedTime } from 'date-fns-tz';
import { db } from '$lib/db';
import { staffAttendance, users } from '$lib/db/schema';
import { isStaffManager } from '$lib/services/auth';
import { TIMEZONE } from '$lib/utils/date';

const PAGE_SIZE = 50;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function addOneDay(dateKey: string): string {
	const date = new Date(`${dateKey}T12:00:00.000Z`);
	date.setUTCDate(date.getUTCDate() + 1);
	return date.toISOString().slice(0, 10);
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const actor = await locals.verifyUser();
	const canManage = isStaffManager(actor);
	const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
	const from = DATE_PATTERN.test(url.searchParams.get('from') ?? '')
		? url.searchParams.get('from')!
		: '';
	const to = DATE_PATTERN.test(url.searchParams.get('to') ?? '') ? url.searchParams.get('to')! : '';
	const userQuery = canManage ? (url.searchParams.get('user') ?? '').trim().slice(0, 100) : '';
	const device = (url.searchParams.get('device') ?? '').trim().slice(0, 50);
	const rawSource = url.searchParams.get('source') ?? '';
	const source = ['card', 'manual', 'simulation'].includes(rawSource)
		? (rawSource as 'card' | 'manual' | 'simulation')
		: '';

	const filters = [];
	if (!canManage) filters.push(eq(staffAttendance.userId, actor.id));
	if (from) {
		filters.push(gte(staffAttendance.readTimestamp, fromZonedTime(`${from}T00:00:00`, TIMEZONE)));
	}
	if (to) {
		filters.push(
			lt(staffAttendance.readTimestamp, fromZonedTime(`${addOneDay(to)}T00:00:00`, TIMEZONE))
		);
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
			.offset((page - 1) * PAGE_SIZE),
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
		activeUsers
	};
};
