import type { PageServerLoad } from './$types';
import { db } from '$lib/db';
import { subscribers, attendance, cardRfid, deviceRegistry, enrollments } from '$lib/db/schema';
import { count, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import {
	enrichSubscribersForList,
	enrollmentMatchesMonth,
	getEnrollmentSortTime
} from '$lib/services/subscriber-list';
import { formatInTimeZone } from 'date-fns-tz';
import { TIMEZONE, nowInRome } from '$lib/utils/date';

export const load: PageServerLoad = async () => {
	const now = nowInRome();

	// Query aggregate in parallelo per performance
	const [
		[{ activeSubscribers }],
		[{ todayAttendance }],
		[{ activeCards }],
		[{ onlineDevices }],
		enrollmentRows
	] = await Promise.all([
		db.select({ activeSubscribers: count() }).from(subscribers).where(eq(subscribers.status, 'active')),
		db
			.select({ todayAttendance: count() })
			.from(attendance)
			.where(sql`DATE(${attendance.readTimestamp}) = DATE(NOW())`),
		db.select({ activeCards: count() }).from(cardRfid).where(eq(cardRfid.status, 'active')),
		db
			.select({ onlineDevices: count() })
			.from(deviceRegistry)
			.where(sql`${deviceRegistry.lastPing} > DATE_SUB(NOW(), INTERVAL 5 MINUTE)`),
		db
			.select({
				id: enrollments.id,
				subscriberId: enrollments.subscriberId,
				productTitle: enrollments.productTitle,
				variantTitle: enrollments.variantTitle,
				preferredDate: enrollments.preferredDate
			})
			.from(enrollments)
			.where(isNotNull(enrollments.subscriberId))
			.orderBy(
				desc(enrollments.preferredDate),
				desc(enrollments.externalCreatedAt),
				desc(enrollments.id)
			)
	]);

	const currentMonthEnrollments = enrollmentRows.filter((enrollment) =>
		enrollmentMatchesMonth(enrollment, now)
	);
	const currentMonthEnrollmentBySubscriber = new Map<number, (typeof currentMonthEnrollments)[number]>();

	for (const enrollment of currentMonthEnrollments) {
		if (enrollment.subscriberId == null) continue;

		const current = currentMonthEnrollmentBySubscriber.get(enrollment.subscriberId);
		if (!current || getEnrollmentSortTime(enrollment) > getEnrollmentSortTime(current)) {
			currentMonthEnrollmentBySubscriber.set(enrollment.subscriberId, enrollment);
		}
	}

	const subscriberIds = [...currentMonthEnrollmentBySubscriber.keys()];

	const currentMonthSubscriberRows =
		subscriberIds.length > 0
			? await db
					.select({
						id: subscribers.id,
						firstName: subscribers.firstName,
						lastName: subscribers.lastName,
						email: subscribers.email,
						status: subscribers.status
					})
					.from(subscribers)
					.where(inArray(subscribers.id, subscriberIds))
					.orderBy(subscribers.lastName, subscribers.firstName, subscribers.id)
			: [];

	const currentMonthSubscribers = await enrichSubscribersForList(currentMonthSubscriberRows, {
		attendanceEnrollmentBySubscriber: currentMonthEnrollmentBySubscriber
	});

	return {
		activeSubscribers,
		todayAttendance,
		activeCards,
		onlineDevices,
		currentMonthLabel: formatInTimeZone(now, TIMEZONE, 'MMMM yyyy'),
		currentMonthSubscribers
	};
};
