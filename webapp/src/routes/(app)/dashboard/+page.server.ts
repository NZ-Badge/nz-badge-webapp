import type { PageServerLoad } from './$types';
import { requirePageUser } from '$lib/services/auth';
import { db } from '$lib/db';
import {
	subscribers,
	attendance,
	cardRfid,
	deviceRegistry,
	enrollments,
	staffAttendance
} from '$lib/db/schema';
import { and, count, desc, eq, gte, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import {
	enrichSubscribersForList,
	enrollmentMatchesMonth,
	getEnrollmentSortTime
} from '$lib/services/subscriber-list';
import { formatInTimeZone } from 'date-fns-tz';
import { TIMEZONE, nowInRome } from '$lib/utils/date';
import {
	determineNextStaffEventType,
	loadStaffAttendanceSettings
} from '$lib/services/staff-attendance';

export const load: PageServerLoad = async ({ locals }) => {
	const user = await requirePageUser(locals);
	const now = nowInRome();

	if (user.role === 'collaborator') {
		const [recentStaffAttendance, attendanceSettings] = await Promise.all([
			db
				.select({
					id: staffAttendance.id,
					eventType: staffAttendance.eventType,
					readTimestamp: staffAttendance.readTimestamp,
					source: staffAttendance.source,
					deviceId: staffAttendance.deviceId,
					isBackdated: staffAttendance.isBackdated
				})
				.from(staffAttendance)
				.where(eq(staffAttendance.userId, user.id))
				.orderBy(desc(staffAttendance.readTimestamp), desc(staffAttendance.id))
				.limit(10),
			loadStaffAttendanceSettings()
		]);
		const nextEventType = await determineNextStaffEventType(
			user.id,
			new Date(),
			attendanceSettings.resetEntryTypeDaily
		);

		return {
			mode: 'collaborator' as const,
			targetUser: { id: user.id, name: user.name, email: user.email },
			recentStaffAttendance,
			nextEventType
		};
	}

	// Query aggregate in parallelo per performance
	const today = new Date(`${formatInTimeZone(new Date(), TIMEZONE, 'yyyy-MM-dd')}T00:00:00.000Z`);
	const [
		[{ activeSubscribers }],
		[{ todayAttendance }],
		[{ activeCards }],
		[{ onlineDevices }],
		enrollmentRows,
		activeEnrollmentRows
	] = await Promise.all([
		db
			.select({ activeSubscribers: count() })
			.from(subscribers)
			.where(eq(subscribers.status, 'active')),
		db
			.select({ todayAttendance: count() })
			.from(attendance)
			.where(sql`DATE(${attendance.readTimestamp}) = DATE(NOW())`),
		db
			.select({ activeCards: count() })
			.from(cardRfid)
			.where(and(eq(cardRfid.status, 'active'), isNotNull(cardRfid.subscriberId))),
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
				startDate: enrollments.startDate,
				endDate: enrollments.endDate
			})
			.from(enrollments)
			.where(isNotNull(enrollments.subscriberId))
			.orderBy(
				desc(enrollments.startDate),
				desc(enrollments.externalCreatedAt),
				desc(enrollments.id)
			),
		db
			.select({
				id: enrollments.id,
				variantId: enrollments.variantId,
				productTitle: enrollments.productTitle,
				variantTitle: enrollments.variantTitle,
				startDate: enrollments.startDate,
				endDate: enrollments.endDate
			})
			.from(enrollments)
			.where(and(lte(enrollments.startDate, today), gte(enrollments.endDate, today)))
			.orderBy(enrollments.endDate, enrollments.productTitle, enrollments.variantTitle)
	]);

	const activeCoursesByKey = new Map<
		string,
		{
			variantId: string | null;
			productTitle: string;
			variantTitle: string | null;
			startDate: Date | null;
			endDate: Date | null;
			enrollmentCount: number;
		}
	>();

	for (const enrollment of activeEnrollmentRows) {
		const startDateKey = enrollment.startDate?.toISOString().slice(0, 10) ?? '';
		const endDateKey = enrollment.endDate?.toISOString().slice(0, 10) ?? '';
		const courseKey = JSON.stringify([
			enrollment.variantId,
			enrollment.productTitle,
			enrollment.variantTitle,
			startDateKey,
			endDateKey
		]);
		const course = activeCoursesByKey.get(courseKey);

		if (course) {
			course.enrollmentCount += 1;
			continue;
		}

		activeCoursesByKey.set(courseKey, {
			variantId: enrollment.variantId,
			productTitle: enrollment.productTitle ?? 'Corso senza nome',
			variantTitle: enrollment.variantTitle,
			startDate: enrollment.startDate,
			endDate: enrollment.endDate,
			enrollmentCount: 1
		});
	}

	const currentMonthEnrollments = enrollmentRows.filter((enrollment) =>
		enrollmentMatchesMonth(enrollment, now)
	);
	const currentMonthEnrollmentBySubscriber = new Map<
		number,
		(typeof currentMonthEnrollments)[number]
	>();

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
		mode: 'management' as const,
		activeSubscribers,
		todayAttendance,
		activeCards,
		onlineDevices,
		activeCourses: [...activeCoursesByKey.values()],
		currentMonthLabel: formatInTimeZone(now, TIMEZONE, 'MMMM yyyy'),
		currentMonthSubscribers
	};
};
