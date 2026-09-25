import { and, asc, count, desc, eq, gte, inArray, like, lt, or, sql, type SQL } from 'drizzle-orm';
import { db } from '$lib/db';
import { attendance, cardRfid, enrollments, subscribers } from '$lib/db/schema';
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
	phone?: string | null;
	taxId?: string | null;
	note?: string | null;
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
	enrollment: Pick<SubscriberEnrollmentRow, 'startDate' | 'endDate' | 'variantTitle'>
): number {
	if (enrollment.startDate) {
		return new Date(enrollment.startDate).getTime();
	}

	const period = getEnrollmentAttendancePeriod({
		id: 0,
		productTitle: null,
		variantTitle: enrollment.variantTitle,
		startDate: enrollment.startDate,
		endDate: enrollment.endDate
	});

	return period?.start ?? Number.NEGATIVE_INFINITY;
}

export function enrollmentMatchesMonth(
	enrollment: Pick<SubscriberEnrollmentRow, 'startDate' | 'endDate' | 'variantTitle'>,
	referenceDate: Date = new Date()
): boolean {
	const period = getEnrollmentAttendancePeriod({
		id: 0,
		productTitle: null,
		variantTitle: enrollment.variantTitle,
		startDate: enrollment.startDate,
		endDate: enrollment.endDate
	});

	if (!period) return false;

	return (
		formatInTimeZone(new Date(period.start), TIMEZONE, 'yyyy-MM') ===
		formatInTimeZone(referenceDate, TIMEZONE, 'yyyy-MM')
	);
}

type LatestEnrollmentRow = SubscriberEnrollmentRow & { subscriberId: number | null };

/** Latest enrollment per subscriber (by start date, then order of `rows`). */
function pickLatestEnrollments(rows: LatestEnrollmentRow[]): Map<number, LatestEnrollmentRow> {
	const latest = new Map<number, LatestEnrollmentRow>();
	for (const enrollment of rows) {
		if (enrollment.subscriberId == null) continue;

		const current = latest.get(enrollment.subscriberId);
		if (!current || getEnrollmentSortTime(enrollment) > getEnrollmentSortTime(current)) {
			latest.set(enrollment.subscriberId, enrollment);
		}
	}
	return latest;
}

const enrollmentListColumns = {
	id: enrollments.id,
	subscriberId: enrollments.subscriberId,
	productTitle: enrollments.productTitle,
	variantTitle: enrollments.variantTitle,
	startDate: enrollments.startDate,
	endDate: enrollments.endDate
};

// Same order the "latest enrollment" pick relies on for ties.
const enrollmentListOrder = [
	desc(enrollments.startDate),
	desc(enrollments.externalCreatedAt),
	desc(enrollments.id)
];

const IN_CHUNK_SIZE = 1000;

function chunk<T>(values: T[], size = IN_CHUNK_SIZE): T[][] {
	const chunks: T[][] = [];
	for (let i = 0; i < values.length; i += size) chunks.push(values.slice(i, i + size));
	return chunks;
}

/**
 * Loads only the attendance rows that fall inside each subscriber's course period
 * (the only rows the course summary uses), grouping subscribers that share a period
 * into one query on `attendance(subscriber_id, read_timestamp)`.
 */
async function loadAttendanceInPeriods(
	enrollmentBySubscriber: Map<number, SubscriberEnrollmentRow>
): Promise<Map<number, SubscriberAttendanceRow[]>> {
	const subscribersByPeriod = new Map<string, { start: number; end: number; ids: number[] }>();

	for (const [subscriberId, enrollment] of enrollmentBySubscriber) {
		const period = getEnrollmentAttendancePeriod(enrollment);
		if (!period) continue;

		const key = `${period.start}:${period.end}`;
		const group = subscribersByPeriod.get(key);
		if (group) group.ids.push(subscriberId);
		else
			subscribersByPeriod.set(key, { start: period.start, end: period.end, ids: [subscriberId] });
	}

	const queries = [...subscribersByPeriod.values()].flatMap((group) =>
		chunk(group.ids).map((ids) =>
			db
				.select({
					id: attendance.id,
					subscriberId: attendance.subscriberId,
					eventType: attendance.eventType,
					readTimestamp: attendance.readTimestamp
				})
				.from(attendance)
				.where(
					and(
						inArray(attendance.subscriberId, ids),
						gte(attendance.readTimestamp, new Date(group.start)),
						lt(attendance.readTimestamp, new Date(group.end))
					)
				)
				.orderBy(desc(attendance.readTimestamp), desc(attendance.id))
		)
	);

	const attendanceBySubscriber = new Map<number, SubscriberAttendanceRow[]>();
	for (const rows of await Promise.all(queries)) {
		for (const row of rows) {
			if (row.subscriberId == null) continue;
			const list = attendanceBySubscriber.get(row.subscriberId);
			if (list) list.push(row);
			else attendanceBySubscriber.set(row.subscriberId, [row]);
		}
	}
	return attendanceBySubscriber;
}

function summarizeCourseAttendance(
	enrollment: SubscriberEnrollmentRow | undefined,
	attendanceRows: SubscriberAttendanceRow[] | undefined
) {
	return enrollment
		? buildSubscriberCourseAttendanceSummary(enrollment, attendanceRows ?? [])
		: null;
}

/**
 * Adds card flags, latest course attendance and last entry to the given rows.
 * Meant for one page of results: queries are restricted to the given ids.
 */
export async function enrichSubscribersForList(
	subscriberRows: SubscriberListBaseRow[],
	options: EnrichSubscriberListOptions = {}
): Promise<SubscriberListRow[]> {
	const ids = subscriberRows.map((subscriber) => subscriber.id);
	if (ids.length === 0) return [];

	const [activeCards, enrollmentRows, lastEntryRows] = await Promise.all([
		db
			.select({ subscriberId: cardRfid.subscriberId, type: cardRfid.type })
			.from(cardRfid)
			.where(and(eq(cardRfid.status, 'active'), inArray(cardRfid.subscriberId, ids))),
		db
			.select(enrollmentListColumns)
			.from(enrollments)
			.where(inArray(enrollments.subscriberId, ids))
			.orderBy(...enrollmentListOrder),
		db
			.select({
				subscriberId: attendance.subscriberId,
				lastEntryAt: sql<Date | string | null>`max(${attendance.readTimestamp})`
			})
			.from(attendance)
			.where(and(inArray(attendance.subscriberId, ids), eq(attendance.eventType, 'entry')))
			.groupBy(attendance.subscriberId)
	]);

	const rfidCardIds = new Set<number>();
	const nfcCardIds = new Set<number>();
	for (const card of activeCards) {
		if (card.subscriberId == null) continue;
		if (card.type === 'nfc') nfcCardIds.add(card.subscriberId);
		else rfidCardIds.add(card.subscriberId);
	}

	const latestEnrollmentBySubscriber = pickLatestEnrollments(enrollmentRows);
	const attendanceEnrollmentBySubscriber = new Map<number, SubscriberEnrollmentRow>();
	for (const id of ids) {
		const enrollment =
			options.attendanceEnrollmentBySubscriber?.get(id) ?? latestEnrollmentBySubscriber.get(id);
		if (enrollment) attendanceEnrollmentBySubscriber.set(id, enrollment);
	}
	const attendanceBySubscriber = await loadAttendanceInPeriods(attendanceEnrollmentBySubscriber);

	const lastEntryBySubscriber = new Map<number, Date | string>();
	for (const row of lastEntryRows) {
		if (row.subscriberId != null && row.lastEntryAt != null) {
			lastEntryBySubscriber.set(row.subscriberId, toDate(row.lastEntryAt));
		}
	}

	return subscriberRows.map((subscriber) => {
		const courseAttendanceSummary = summarizeCourseAttendance(
			attendanceEnrollmentBySubscriber.get(subscriber.id),
			attendanceBySubscriber.get(subscriber.id)
		);

		return {
			...subscriber,
			hasActiveCard: rfidCardIds.has(subscriber.id),
			hasNfcPairing: nfcCardIds.has(subscriber.id),
			latestCourseAttendance: courseAttendanceSummary?.totalLabel ?? '—',
			latestCourseAttendanceMinutes: courseAttendanceSummary?.totalMinutes ?? null,
			lastEntryAt: lastEntryBySubscriber.get(subscriber.id) ?? null
		};
	});
}

/**
 * `MAX(datetime)` comes back from mysql2 as a string without timezone (drizzle only maps
 * typed columns); DATETIME values are stored in UTC, as drizzle writes them.
 */
function toDate(value: Date | string): Date {
	if (value instanceof Date) return value;
	return new Date(`${value.replace(' ', 'T')}Z`);
}

// ── Paginated list ────────────────────────────────────────────────────────────

export const SUBSCRIBER_LIST_SORT_FIELDS = [
	'name',
	'email',
	'latestCourseAttendance',
	'lastEntryAt',
	'card'
] as const;

export type SubscriberListSortField = (typeof SUBSCRIBER_LIST_SORT_FIELDS)[number];
export type SortDirection = 'asc' | 'desc';

export function parseSubscriberListSortField(value: string | null): SubscriberListSortField {
	return SUBSCRIBER_LIST_SORT_FIELDS.find((field) => field === value) ?? 'name';
}

export function parseSortDirection(value: string | null): SortDirection {
	return value === 'desc' ? 'desc' : 'asc';
}

export interface SubscriberListQuery {
	q: string;
	sort: SubscriberListSortField;
	dir: SortDirection;
	page: number;
	pageSize: number;
}

export interface SubscriberListPage {
	subscribers: SubscriberListRow[];
	total: number;
	page: number;
	totalPages: number;
}

const subscriberListColumns = {
	id: subscribers.id,
	firstName: subscribers.firstName,
	lastName: subscribers.lastName,
	email: subscribers.email,
	phone: subscribers.phone,
	taxId: subscribers.taxId,
	note: subscribers.note,
	status: subscribers.status
};

function escapeLike(value: string): string {
	return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export function buildSubscriberSearchFilter(q: string): SQL | undefined {
	if (!q) return undefined;
	const pattern = `%${escapeLike(q)}%`;
	return or(
		like(subscribers.firstName, pattern),
		like(subscribers.lastName, pattern),
		like(subscribers.email, pattern)
	);
}

const direction = (dir: SortDirection) => (dir === 'desc' ? desc : asc);

/** Name order used as primary key for `name` and as tie-breaker for every other sort. */
function nameOrder(dir: SortDirection = 'asc'): SQL[] {
	const by = direction(dir);
	return [by(subscribers.firstName), by(subscribers.lastName), by(subscribers.id)];
}

function activeCardExists(type: 'rfid' | 'nfc'): SQL {
	const typeCondition =
		type === 'nfc' ? sql`${cardRfid.type} = 'nfc'` : sql`${cardRfid.type} <> 'nfc'`;
	return sql`exists (select 1 from ${cardRfid} where ${cardRfid.subscriberId} = ${subscribers.id} and ${cardRfid.status} = 'active' and ${typeCondition})`;
}

/**
 * One page of the subscriber list, filtered, sorted and paginated in SQL; only the rows of
 * the page are enriched. The `latestCourseAttendance` sort depends on the entry/exit pairing
 * done in `calculateAttendanceHours`, so for that key the minutes are computed for the
 * filtered subscribers from their current-period attendance only (see `sortByCourseMinutes`).
 */
export async function listSubscribersPage(query: SubscriberListQuery): Promise<SubscriberListPage> {
	const whereClause = buildSubscriberSearchFilter(query.q);

	const [{ total }] = await db.select({ total: count() }).from(subscribers).where(whereClause);
	const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
	const page = Math.min(Math.max(1, query.page), totalPages);
	const offset = (page - 1) * query.pageSize;

	if (total === 0) return { subscribers: [], total, page, totalPages };

	let pageRows: SubscriberListBaseRow[];

	if (query.sort === 'latestCourseAttendance') {
		const pageIds = (await sortByCourseMinutes(whereClause, query.dir)).slice(
			offset,
			offset + query.pageSize
		);
		const rows = pageIds.length
			? await db
					.select(subscriberListColumns)
					.from(subscribers)
					.where(inArray(subscribers.id, pageIds))
			: [];
		const byId = new Map(rows.map((row) => [row.id, row]));
		pageRows = pageIds.flatMap((id) => byId.get(id) ?? []);
	} else {
		pageRows = await selectSortedPage(whereClause, query.sort, query.dir, offset, query.pageSize);
	}

	return { subscribers: await enrichSubscribersForList(pageRows), total, page, totalPages };
}

async function selectSortedPage(
	whereClause: SQL | undefined,
	sort: Exclude<SubscriberListSortField, 'latestCourseAttendance'>,
	dir: SortDirection,
	offset: number,
	limit: number
): Promise<SubscriberListBaseRow[]> {
	const by = direction(dir);

	switch (sort) {
		case 'email':
			return db
				.select(subscriberListColumns)
				.from(subscribers)
				.where(whereClause)
				.orderBy(by(subscribers.email), ...nameOrder())
				.limit(limit)
				.offset(offset);
		case 'card': {
			const hasRfid = activeCardExists('rfid');
			const hasNfc = activeCardExists('nfc');
			return db
				.select(subscriberListColumns)
				.from(subscribers)
				.where(whereClause)
				.orderBy(by(sql`(${hasRfid} or ${hasNfc})`), by(hasRfid), by(hasNfc), ...nameOrder())
				.limit(limit)
				.offset(offset);
		}
		case 'lastEntryAt': {
			// Aggregated derived table: one MAX per subscriber, joined to the filtered page.
			const lastEntry = db
				.select({
					subscriberId: attendance.subscriberId,
					lastEntryAt: sql<Date>`max(${attendance.readTimestamp})`.as('last_entry_at')
				})
				.from(attendance)
				.where(eq(attendance.eventType, 'entry'))
				.groupBy(attendance.subscriberId)
				.as('last_entry');
			// Subscribers without entries always go last, in both directions.
			return db
				.select(subscriberListColumns)
				.from(subscribers)
				.leftJoin(lastEntry, eq(lastEntry.subscriberId, subscribers.id))
				.where(whereClause)
				.orderBy(
					asc(sql`${lastEntry.lastEntryAt} is null`),
					by(lastEntry.lastEntryAt),
					...nameOrder()
				)
				.limit(limit)
				.offset(offset);
		}
		case 'name':
		default:
			return db
				.select(subscriberListColumns)
				.from(subscribers)
				.where(whereClause)
				.orderBy(...nameOrder(dir))
				.limit(limit)
				.offset(offset);
	}
}

/**
 * Filtered subscriber ids ordered by the minutes of their latest course
 * (no enrollment → last, in both directions; ties by name).
 */
async function sortByCourseMinutes(
	whereClause: SQL | undefined,
	dir: SortDirection
): Promise<number[]> {
	const [subscriberRows, enrollmentRows] = await Promise.all([
		db
			.select({
				id: subscribers.id,
				firstName: subscribers.firstName,
				lastName: subscribers.lastName
			})
			.from(subscribers)
			.where(whereClause),
		db
			.select(enrollmentListColumns)
			.from(enrollments)
			.innerJoin(subscribers, eq(enrollments.subscriberId, subscribers.id))
			.where(whereClause)
			.orderBy(...enrollmentListOrder)
	]);

	const latestEnrollmentBySubscriber = pickLatestEnrollments(enrollmentRows);
	const attendanceBySubscriber = await loadAttendanceInPeriods(latestEnrollmentBySubscriber);

	const rows = subscriberRows.map((subscriber) => ({
		...subscriber,
		minutes:
			summarizeCourseAttendance(
				latestEnrollmentBySubscriber.get(subscriber.id),
				attendanceBySubscriber.get(subscriber.id)
			)?.totalMinutes ?? null
	}));

	const collator = new Intl.Collator('it', { sensitivity: 'base', numeric: true });
	const compareName = (left: (typeof rows)[number], right: (typeof rows)[number]) =>
		collator.compare(left.firstName, right.firstName) ||
		collator.compare(left.lastName, right.lastName) ||
		left.id - right.id;

	rows.sort((left, right) => {
		if (left.minutes !== right.minutes) {
			if (left.minutes == null) return 1;
			if (right.minutes == null) return -1;
			return dir === 'desc' ? right.minutes - left.minutes : left.minutes - right.minutes;
		}
		return compareName(left, right);
	});

	return rows.map((row) => row.id);
}
