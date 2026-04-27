import type { PageServerLoad } from './$types';
import { db } from '$lib/db';
import { attendance, subscribers } from '$lib/db/schema';
import { eq, and, like, gte, lte, count, sql } from 'drizzle-orm';

const PAGE_SIZE = 50;

export const load: PageServerLoad = async ({ url }) => {
	const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
	const from = url.searchParams.get('from') ?? '';
	const to = url.searchParams.get('to') ?? '';
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

	const [rows, [{ total }]] = await Promise.all([
		db
			.select({
				id: attendance.id,
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
			.where(whereClause)
	]);

	// Costruisce URL export CSV con i filtri attivi
	const exportParams = new URLSearchParams();
	if (from) exportParams.set('from', from);
	if (to) exportParams.set('to', to);
	if (subscriber) exportParams.set('subscriber', subscriber);
	if (device) exportParams.set('device', device);
	const exportUrl = `/api/v1/attendance/export?${exportParams.toString()}`;

	return {
		rows,
		total,
		page,
		totalPages: Math.ceil(total / PAGE_SIZE),
		from,
		to,
		subscriber,
		device,
		exportUrl
	};
};
