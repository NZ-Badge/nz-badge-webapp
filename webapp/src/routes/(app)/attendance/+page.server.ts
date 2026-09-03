import type { PageServerLoad } from './$types';
import { db } from '$lib/db';
import { attendance, subscribers } from '$lib/db/schema';
import { TIMEZONE } from '$lib/utils/date';
import { formatInTimeZone } from 'date-fns-tz';
import { eq, and, like, gte, lte, count, sql, asc } from 'drizzle-orm';

const PAGE_SIZE = 50;
const DEFAULT_LOOKBACK_DAYS = 30;

function dateInputValueDaysAgo(daysAgo: number): string {
	const date = new Date();
	date.setDate(date.getDate() - daysAgo);
	return formatInTimeZone(date, TIMEZONE, 'yyyy-MM-dd');
}

export const load: PageServerLoad = async ({ url }) => {
	const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
	const from = url.searchParams.get('from')?.trim() || dateInputValueDaysAgo(DEFAULT_LOOKBACK_DAYS);
	const to = url.searchParams.get('to')?.trim() || dateInputValueDaysAgo(0);
	const subscriber = url.searchParams.get('subscriber')?.trim() ?? '';
	const device = url.searchParams.get('device')?.trim() ?? '';

	const filters = [];

	if (from) filters.push(gte(attendance.readTimestamp, new Date(from)));
	if (to) {
		// Includi tutta la giornata 'to' aggiungendo 1 giorno
		const toDate = new Date(to);
		toDate.setDate(toDate.getDate() + 1);
		filters.push(lte(attendance.readTimestamp, toDate));
	}
	if (device) filters.push(like(attendance.deviceId, `%${device}%`));
	if (subscriber) {
		filters.push(
			sql`CONCAT(${subscribers.firstName}, ' ', ${subscribers.lastName}, ' ', COALESCE(${subscribers.email}, '')) LIKE ${`%${subscriber}%`}`
		);
	}

	const whereClause = filters.length > 0 ? and(...filters) : undefined;

	const [rows, [{ total }], subscriberRows] = await Promise.all([
		db
			.select({
				id: attendance.id,
				subscriberId: attendance.subscriberId,
				cardUid: attendance.cardUid,
				deviceId: attendance.deviceId,
				eventType: attendance.eventType,
				readTimestamp: attendance.readTimestamp,
				offlineQueued: attendance.offlineQueued,
				subscriberName: subscribers.firstName,
				subscriberSurname: subscribers.lastName
			})
			.from(attendance)
			.leftJoin(subscribers, eq(attendance.subscriberId, subscribers.id))
			.where(whereClause)
			.orderBy(sql`${attendance.readTimestamp} DESC`)
			.limit(PAGE_SIZE)
			.offset((page - 1) * PAGE_SIZE),
		db
			.select({ total: count() })
			.from(attendance)
			.leftJoin(subscribers, eq(attendance.subscriberId, subscribers.id))
			.where(whereClause),
		db
			.select({
				id: subscribers.id,
				firstName: subscribers.firstName,
				lastName: subscribers.lastName,
				email: subscribers.email
			})
			.from(subscribers)
			.orderBy(asc(subscribers.lastName), asc(subscribers.firstName))
	]);

	const subscriberOptions = subscriberRows.map((row) => ({
		id: row.id,
		name: `${row.firstName} ${row.lastName}`.trim(),
		email: row.email
	}));

	return {
		rows,
		total,
		page,
		totalPages: Math.ceil(total / PAGE_SIZE),
		from,
		to,
		subscriber,
		device,
		subscriberOptions
	};
};
