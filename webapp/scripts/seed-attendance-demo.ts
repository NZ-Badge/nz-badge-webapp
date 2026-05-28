import { and, asc, desc, eq, inArray, isNotNull, like, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { attendance, cardRfid, enrollments, subscribers } from '../src/lib/db/schema';

const DEMO_DEVICE_ID = 'TEST-SEED-ATTENDANCE';
const DEMO_NOTE_PREFIX = 'demo_attendance_seed:';
const DEFAULT_COURSE_DAYS = 7;
const DEFAULT_LIMIT = 3;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
	console.error('Missing DATABASE_URL env var');
	process.exit(1);
}

function parseIdList(value: string | undefined): number[] {
	if (!value) return [];
	return value
		.split(',')
		.map((item) => Number(item.trim()))
		.filter((item) => Number.isInteger(item) && item > 0);
}

function parseLimit(value: string | undefined): number {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_LIMIT;
	return Math.min(parsed, 10);
}

function toDateKey(value: Date | string): string {
	if (typeof value === 'string') return value.slice(0, 10);
	return value.toISOString().slice(0, 10);
}

function addDays(dateKey: string, days: number): string {
	const date = new Date(`${dateKey}T00:00:00.000Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

function atLocalCourseTime(dateKey: string, hours: number, minutes = 0): Date {
	return new Date(
		`${dateKey}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00.000`
	);
}

function buildSessions(startDate: Date | string, enrollmentIndex: number) {
	const startDateKey = toDateKey(startDate);
	const firstDay = addDays(startDateKey, Math.min(enrollmentIndex, 2));
	const secondDay = addDays(firstDay, 1);
	const thirdDay = addDays(firstDay, 2);

	return [
		{
			entryAt: atLocalCourseTime(firstDay, 9, 0),
			exitAt: atLocalCourseTime(firstDay, 12, 0)
		},
		{
			entryAt: atLocalCourseTime(secondDay, 14, 0),
			exitAt: atLocalCourseTime(secondDay, 16, 30 + enrollmentIndex * 5)
		},
		{
			entryAt: atLocalCourseTime(thirdDay, 10, 15),
			exitAt: atLocalCourseTime(thirdDay, 11, 45)
		}
	];
}

const connection = await mysql.createConnection(databaseUrl);
const db = drizzle(connection);

try {
	const limit = parseLimit(process.env.DEMO_ATTENDANCE_LIMIT);
	const subscriberIds = parseIdList(process.env.DEMO_SUBSCRIBER_IDS);
	const enrollmentIds = parseIdList(process.env.DEMO_ENROLLMENT_IDS);

	const filters = [
		isNotNull(enrollments.subscriberId),
		isNotNull(enrollments.startDate),
		sql`${enrollments.startDate} <= CURRENT_DATE()`,
		eq(cardRfid.status, 'active')
	];

	if (enrollmentIds.length > 0) {
		filters.push(inArray(enrollments.id, enrollmentIds));
	}

	if (subscriberIds.length > 0) {
		filters.push(inArray(enrollments.subscriberId, subscriberIds));
	}

	const candidates = await db
		.select({
			enrollmentId: enrollments.id,
			subscriberId: enrollments.subscriberId,
			firstName: subscribers.firstName,
			lastName: subscribers.lastName,
			productTitle: enrollments.productTitle,
			variantTitle: enrollments.variantTitle,
			startDate: enrollments.startDate,
			endDate: enrollments.endDate,
			cardUid: cardRfid.uid,
			uidRaw: cardRfid.uid
		})
		.from(enrollments)
		.innerJoin(subscribers, eq(subscribers.id, enrollments.subscriberId))
		.innerJoin(cardRfid, eq(cardRfid.subscriberId, subscribers.id))
		.where(and(...filters))
		.orderBy(
			desc(enrollments.startDate),
			asc(enrollments.subscriberId),
			asc(enrollments.id),
			asc(cardRfid.id)
		)
		.limit(100);

	const seenKeys = new Set<number>();
	const selectedEnrollments = [];

	for (const candidate of candidates) {
		const key = enrollmentIds.length > 0 ? candidate.enrollmentId : candidate.subscriberId;
		if (!key || seenKeys.has(key)) continue;

		seenKeys.add(key);
		selectedEnrollments.push(candidate);

		if (selectedEnrollments.length >= limit) break;
	}

	if (selectedEnrollments.length === 0) {
		console.error(
			'No eligible enrollments found. Need enrollments with subscriber_id, start_date and an active card.'
		);
		process.exit(1);
	}

	const selectedEnrollmentIds = selectedEnrollments.map((enrollment) => enrollment.enrollmentId);

	await db
		.delete(attendance)
		.where(
			and(eq(attendance.deviceId, DEMO_DEVICE_ID), like(attendance.note, `${DEMO_NOTE_PREFIX}%`))
		);

	let insertedEvents = 0;
	const summaries: string[] = [];

	for (const [index, enrollment] of selectedEnrollments.entries()) {
		if (!enrollment.subscriberId || !enrollment.startDate) continue;

		const effectiveEndDate = enrollment.endDate
			? toDateKey(enrollment.endDate)
			: addDays(toDateKey(enrollment.startDate), DEFAULT_COURSE_DAYS - 1);

		if (!enrollment.endDate) {
			await db
				.update(enrollments)
				.set({ endDate: sql`${effectiveEndDate}` })
				.where(eq(enrollments.id, enrollment.enrollmentId));
		}

		const rows = buildSessions(enrollment.startDate, index).flatMap((session) => [
			{
				cardUid: enrollment.cardUid,
				uidRaw: enrollment.uidRaw,
				subscriberId: enrollment.subscriberId!,
				deviceId: DEMO_DEVICE_ID,
				eventType: 'entry' as const,
				readTimestamp: session.entryAt,
				deviceTimeRaw: session.entryAt,
				offlineQueued: false,
				validated: true,
				note: `${DEMO_NOTE_PREFIX}${enrollment.enrollmentId}`
			},
			{
				cardUid: enrollment.cardUid,
				uidRaw: enrollment.uidRaw,
				subscriberId: enrollment.subscriberId!,
				deviceId: DEMO_DEVICE_ID,
				eventType: 'exit' as const,
				readTimestamp: session.exitAt,
				deviceTimeRaw: session.exitAt,
				offlineQueued: false,
				validated: true,
				note: `${DEMO_NOTE_PREFIX}${enrollment.enrollmentId}`
			}
		]);

		await db.insert(attendance).values(rows);
		insertedEvents += rows.length;

		summaries.push(
			`#${enrollment.enrollmentId} ${enrollment.firstName} ${enrollment.lastName} - ${enrollment.variantTitle ?? enrollment.productTitle ?? 'corso'} (${toDateKey(enrollment.startDate)} / ${effectiveEndDate})`
		);
	}

	console.log(`Demo attendance regenerated for enrollments: ${selectedEnrollmentIds.join(', ')}`);
	console.log(`Inserted ${insertedEvents} valid attendance events via ${DEMO_DEVICE_ID}.`);
	for (const summary of summaries) console.log(`- ${summary}`);
} finally {
	await connection.end();
}
