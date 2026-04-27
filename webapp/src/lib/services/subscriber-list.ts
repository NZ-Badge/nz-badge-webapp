import { desc, eq, inArray, and } from 'drizzle-orm';
import { db } from '$lib/db';
import { attendance, cardRfid, enrollments } from '$lib/db/schema';
import {
	buildSubscriberCourseAttendanceSummary,
	getEnrollmentAttendancePeriod,
	type SubscriberAttendanceRow,
	type SubscriberEnrollmentRow
} from '$lib/services/subscriber-course-attendance';
import { TIMEZONE } from '$lib/utils/date';
import { formatInTimeZone } from 'date-fns-tz';

export interface SubscriberListBaseRow {
	id: number;
	firstName: string;
	lastName: string;
	email: string;
	status: 'active' | 'completed' | 'suspended' | 'cancelled' | null;
}

export interface SubscriberListRow extends SubscriberListBaseRow {
	hasActiveCard: boolean;
	hasNfcPairing: boolean;
	latestCourseAttendance: string;
	latestCourseAttendanceMinutes: number | null;
	lastEntryAt: Date | string | null;
}

interface EnrichSubscriberListOptions {
	attendanceEnrollmentBySubscriber?: Map<number, SubscriberEnrollmentRow>;
}

export function getEnrollmentSortTime(
	enrollment: Pick<SubscriberEnrollmentRow, 'preferredDate' | 'variantTitle'>
): number {
	if (enrollment.preferredDate) {
		return new Date(enrollment.preferredDate).getTime();
	}

	const period = getEnrollmentAttendancePeriod({
		id: 0,
		productTitle: null,
		variantTitle: enrollment.variantTitle,
		preferredDate: enrollment.preferredDate
	});

	return period?.start ?? Number.NEGATIVE_INFINITY;
}

export function enrollmentMatchesMonth(
	enrollment: Pick<SubscriberEnrollmentRow, 'preferredDate' | 'variantTitle'>,
	referenceDate: Date = new Date()
): boolean {
	const period = getEnrollmentAttendancePeriod({
		id: 0,
		productTitle: null,
		variantTitle: enrollment.variantTitle,
		preferredDate: enrollment.preferredDate
	});

	if (!period) return false;

	return (
		formatInTimeZone(new Date(period.start), TIMEZONE, 'yyyy-MM') ===
		formatInTimeZone(referenceDate, TIMEZONE, 'yyyy-MM')
	);
}

export async function enrichSubscribersForList(
	subscriberRows: SubscriberListBaseRow[],
	options: EnrichSubscriberListOptions = {}
): Promise<SubscriberListRow[]> {
	const ids = subscriberRows.map((subscriber) => subscriber.id);
	if (ids.length === 0) return [];

	const [activeCards, enrollmentRows, attendanceRows] = await Promise.all([
		db
			.select({ subscriberId: cardRfid.subscriberId, type: cardRfid.type })
			.from(cardRfid)
			.where(and(eq(cardRfid.status, 'active'), inArray(cardRfid.subscriberId, ids))),
		db
			.select({
				id: enrollments.id,
				subscriberId: enrollments.subscriberId,
				productTitle: enrollments.productTitle,
				variantTitle: enrollments.variantTitle,
				preferredDate: enrollments.preferredDate
			})
			.from(enrollments)
			.where(inArray(enrollments.subscriberId, ids))
			.orderBy(
				desc(enrollments.preferredDate),
				desc(enrollments.externalCreatedAt),
				desc(enrollments.id)
			),
		db
			.select({
				id: attendance.id,
				subscriberId: attendance.subscriberId,
				eventType: attendance.eventType,
				readTimestamp: attendance.readTimestamp
			})
			.from(attendance)
			.where(inArray(attendance.subscriberId, ids))
			.orderBy(desc(attendance.readTimestamp), desc(attendance.id))
	]);

	const rfidCardIds = new Set<number>();
	const nfcCardIds = new Set<number>();
	const latestEnrollmentBySubscriber = new Map<
		number,
		SubscriberEnrollmentRow & { subscriberId: number | null }
	>();
	const attendanceBySubscriber = new Map<number, SubscriberAttendanceRow[]>();
	const latestEntryBySubscriber = new Map<number, Date | string>();

	for (const card of activeCards) {
		if (card.subscriberId == null) continue;
		if (card.type === 'nfc') nfcCardIds.add(card.subscriberId);
		else rfidCardIds.add(card.subscriberId);
	}

	for (const enrollment of enrollmentRows) {
		if (enrollment.subscriberId == null) continue;

		const current = latestEnrollmentBySubscriber.get(enrollment.subscriberId);
		if (!current || getEnrollmentSortTime(enrollment) > getEnrollmentSortTime(current)) {
			latestEnrollmentBySubscriber.set(enrollment.subscriberId, enrollment);
		}
	}

	for (const row of attendanceRows) {
		if (row.subscriberId == null) continue;

		if (!attendanceBySubscriber.has(row.subscriberId)) {
			attendanceBySubscriber.set(row.subscriberId, []);
		}
		attendanceBySubscriber.get(row.subscriberId)!.push(row);

		if (row.eventType === 'entry' && !latestEntryBySubscriber.has(row.subscriberId)) {
			latestEntryBySubscriber.set(row.subscriberId, row.readTimestamp);
		}
	}

	return subscriberRows.map((subscriber) => {
		const attendanceEnrollment =
			options.attendanceEnrollmentBySubscriber?.get(subscriber.id) ??
			latestEnrollmentBySubscriber.get(subscriber.id);
		const courseAttendanceSummary = attendanceEnrollment
			? buildSubscriberCourseAttendanceSummary(
					attendanceEnrollment,
					attendanceBySubscriber.get(subscriber.id) ?? []
				)
			: null;

		return {
			...subscriber,
			hasActiveCard: rfidCardIds.has(subscriber.id),
			hasNfcPairing: nfcCardIds.has(subscriber.id),
			latestCourseAttendance: courseAttendanceSummary?.totalLabel ?? '—',
			latestCourseAttendanceMinutes: courseAttendanceSummary?.totalMinutes ?? null,
			lastEntryAt: latestEntryBySubscriber.get(subscriber.id) ?? null
		};
	});
}
