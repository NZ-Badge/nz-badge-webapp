import type { PageServerLoad } from './$types';
import { db } from '$lib/db';
import { attendance, enrollments, subscribers } from '$lib/db/schema';
import { buildTodayRoster, getRomeDay } from '$lib/services/today-course-roster';
import { and, eq, gte, inArray, isNotNull, lte, lt } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
	const day = getRomeDay(new Date());
	const courseDate = new Date(`${day.dateKey}T00:00:00.000Z`);
	const enrollmentRows = await db
		.select({
			id: enrollments.id,
			subscriberId: enrollments.subscriberId,
			firstName: enrollments.firstName,
			lastName: enrollments.lastName,
			subscriberFirstName: subscribers.firstName,
			subscriberLastName: subscribers.lastName,
			productTitle: enrollments.productTitle,
			variantTitle: enrollments.variantTitle
		})
		.from(enrollments)
		.leftJoin(subscribers, eq(enrollments.subscriberId, subscribers.id))
		.where(
			and(
				isNotNull(enrollments.startDate),
				isNotNull(enrollments.endDate),
				lte(enrollments.startDate, courseDate),
				gte(enrollments.endDate, courseDate)
			)
		);

	const subscriberIds = [
		...new Set(
			enrollmentRows.flatMap((row) => (row.subscriberId === null ? [] : [row.subscriberId]))
		)
	];
	const swipes =
		subscriberIds.length === 0
			? []
			: await db
					.select({
						subscriberId: attendance.subscriberId,
						readTimestamp: attendance.readTimestamp
					})
					.from(attendance)
					.where(
						and(
							inArray(attendance.subscriberId, subscriberIds),
							gte(attendance.readTimestamp, day.start),
							lt(attendance.readTimestamp, day.end)
						)
					);

	const rows = buildTodayRoster(enrollmentRows, swipes);
	return {
		dateKey: day.dateKey,
		rows,
		present: rows.filter((row) => row.firstSwipe !== null).length,
		missing: rows.filter((row) => row.subscriberId !== null && row.firstSwipe === null).length,
		unlinked: rows.filter((row) => row.subscriberId === null).length
	};
};
