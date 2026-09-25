import type { PageServerLoad } from './$types';
import { requirePageStaff } from '$lib/services/auth';
import { db } from '$lib/db';
import { attendance, subscribers } from '$lib/db/schema';
import { addDaysToDateKey, isDateKey, romeDateKey } from '$lib/utils/date';
import { buildSubscriberAttendanceFilterConditions } from '$lib/services/subscriber-attendance-admin';
import { eq, and, count, sql, asc } from 'drizzle-orm';

const PAGE_SIZE = 50;
const DEFAULT_LOOKBACK_DAYS = 30;

function dateInputValueDaysAgo(daysAgo: number): string {
	return addDaysToDateKey(romeDateKey(new Date()), -daysAgo);
}

export const load: PageServerLoad = async ({ url, locals }) => {
	await requirePageStaff(locals);
	const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
	const from = url.searchParams.get('from')?.trim() || dateInputValueDaysAgo(DEFAULT_LOOKBACK_DAYS);
	const to = url.searchParams.get('to')?.trim() || dateInputValueDaysAgo(0);
	const subscriber = url.searchParams.get('subscriber')?.trim() ?? '';
	const device = url.searchParams.get('device')?.trim() ?? '';

	// Stessi filtri (e confini di giorno Europe/Rome) usati dall'eliminazione multipla.
	const filters = buildSubscriberAttendanceFilterConditions({
		from: isDateKey(from) ? from : undefined,
		to: isDateKey(to) ? to : undefined,
		subscriber: subscriber || undefined,
		device: device || undefined
	});

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
