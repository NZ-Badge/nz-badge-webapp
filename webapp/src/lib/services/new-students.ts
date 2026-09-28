import { db } from '$lib/db';
import { enrollments, subscribers } from '$lib/db/schema';
import { addDaysToDateKey, dateKeySchema, formatDateIT, romeDateKey } from '$lib/utils/date';
import { toCsv } from '$lib/utils/csv';
import {
	and,
	asc,
	eq,
	exists,
	gte,
	inArray,
	isNotNull,
	isNull,
	lt,
	ne,
	not,
	or,
	sql,
	type SQL
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';

export function selectedDateRange(from: string | null, to: string | null, now = new Date()) {
	const today = romeDateKey(now);
	const date = new Date(`${today}T12:00:00.000Z`);
	const weekStart = addDaysToDateKey(today, -(date.getUTCDay() + 6) % 7);
	const start = from === null ? weekStart : dateKeySchema.parse(from);
	const end = to === null ? addDaysToDateKey(weekStart, 6) : dateKeySchema.parse(to);
	if (start > end) throw new RangeError('La data Da deve precedere o coincidere con la data A.');
	return { start, end, next: addDaysToDateKey(end, 1) };
}

const completedPeer = alias(enrollments, 'completed_peer');

export function newStudentsFilter(start: string, next: string) {
	// A submitted, unlinked participant can remain after the same person/course was completed.
	// Keep other submitted enrollments visible, including ones without a completed counterpart.
	const redundantSubmitted = and(
		eq(enrollments.status, 'SUBMITTED'),
		isNull(enrollments.subscriberId),
		isNotNull(enrollments.firstName),
		isNotNull(enrollments.lastName),
		exists(
			db
				.select({ id: completedPeer.id })
				.from(completedPeer)
				.where(
					and(
						eq(completedPeer.status, 'COMPLETED'),
						eq(completedPeer.orderId, enrollments.orderId),
						eq(completedPeer.lineItemId, enrollments.lineItemId),
						eq(completedPeer.firstName, enrollments.firstName),
						eq(completedPeer.lastName, enrollments.lastName),
						eq(completedPeer.customerEmail, enrollments.customerEmail),
						eq(completedPeer.startDate, enrollments.startDate),
						ne(completedPeer.id, enrollments.id)
					)
				)
		)
	)!;
	return and(
		gte(enrollments.startDate, sql`cast(${start} as date)`),
		lt(enrollments.startDate, sql`cast(${next} as date)`),
		not(redundantSubmitted)
	)!;
}

/**
 * Una persona compare una sola volta anche con più corsi in partenza nell'intervallo:
 * le iscrizioni collegate a un iscritto sono raggruppate per `subscriber_id`, quelle non
 * ancora collegate restano una riga ciascuna, salvo le copie SUBMITTED di un corso
 * già COMPLETED per la stessa persona nello stesso ordine.
 */
// Letterali inline (non parametri) così SELECT e GROUP BY usano la stessa espressione.
const personKey = sql<string>`coalesce(concat(${sql.raw("'s:'")}, ${enrollments.subscriberId}), concat(${sql.raw("'e:'")}, ${enrollments.id}))`;

export async function countNewStudents(start: string, next: string): Promise<number> {
	const [{ total }] = await db
		.select({ total: sql<number>`count(distinct ${personKey})` })
		.from(enrollments)
		.where(newStudentsFilter(start, next));
	return Number(total);
}

export interface NewStudentEnrollment {
	id: number;
	subscriberId: number | null;
	firstName: string | null;
	lastName: string | null;
	subscriberFirstName: string | null;
	subscriberLastName: string | null;
	email: string;
	phone: string | null;
	productTitle: string | null;
	variantTitle: string | null;
	startDate: Date | string | null;
	endDate: Date | string | null;
}

export interface NewStudentCourse {
	id: number;
	productTitle: string | null;
	variantTitle: string | null;
	startDate: Date | string | null;
	endDate: Date | string | null;
}

export interface NewStudentRow {
	key: string;
	subscriberId: number | null;
	firstName: string;
	lastName: string;
	email: string;
	phone: string | null;
	/** Inizio del primo corso della persona nell'intervallo. */
	startDate: Date | string | null;
	courses: NewStudentCourse[];
}

function sortTime(value: Date | string | null): number {
	return value ? new Date(value).getTime() : Number.POSITIVE_INFINITY;
}

/** Raggruppa le iscrizioni per persona, conservando l'ordine della prima iscrizione. */
export function groupNewStudents(rows: NewStudentEnrollment[]): NewStudentRow[] {
	const byKey = new Map<string, NewStudentRow>();
	for (const row of rows) {
		const key = row.subscriberId === null ? `e:${row.id}` : `s:${row.subscriberId}`;
		let student = byKey.get(key);
		if (!student) {
			student = {
				key,
				subscriberId: row.subscriberId,
				firstName: row.subscriberFirstName ?? row.firstName ?? '',
				lastName: row.subscriberLastName ?? row.lastName ?? '',
				email: row.email,
				phone: row.phone,
				startDate: row.startDate,
				courses: []
			};
			byKey.set(key, student);
		}
		student.phone ??= row.phone;
		if (sortTime(row.startDate) < sortTime(student.startDate)) student.startDate = row.startDate;
		student.courses.push({
			id: row.id,
			productTitle: row.productTitle,
			variantTitle: row.variantTitle,
			startDate: row.startDate,
			endDate: row.endDate
		});
	}
	for (const student of byKey.values()) {
		student.courses.sort((a, b) => sortTime(a.startDate) - sortTime(b.startDate) || a.id - b.id);
	}
	return [...byKey.values()];
}

export async function getNewStudents(
	start: string,
	next: string,
	pagination?: { limit: number; offset: number }
): Promise<NewStudentRow[]> {
	let pageFilter: SQL | undefined;
	let pageKeys: string[] | undefined;

	if (pagination) {
		// Pagina sulle persone, non sulle iscrizioni.
		const keyRows = await db
			.select({ key: personKey })
			.from(enrollments)
			.leftJoin(subscribers, eq(enrollments.subscriberId, subscribers.id))
			.where(newStudentsFilter(start, next))
			.groupBy(personKey)
			.orderBy(
				sql`min(${enrollments.startDate})`,
				sql`min(coalesce(${subscribers.lastName}, ${enrollments.lastName}))`,
				sql`min(coalesce(${subscribers.firstName}, ${enrollments.firstName}))`,
				personKey
			)
			.limit(pagination.limit)
			.offset(pagination.offset);
		pageKeys = keyRows.map((row) => row.key);
		if (pageKeys.length === 0) return [];

		const subscriberIds = pageKeys.flatMap((key) =>
			key.startsWith('s:') ? [Number(key.slice(2))] : []
		);
		const enrollmentIds = pageKeys.flatMap((key) =>
			key.startsWith('e:') ? [Number(key.slice(2))] : []
		);
		pageFilter = or(
			subscriberIds.length ? inArray(enrollments.subscriberId, subscriberIds) : undefined,
			enrollmentIds.length ? inArray(enrollments.id, enrollmentIds) : undefined
		);
	}

	const rows = await db
		.select({
			id: enrollments.id,
			subscriberId: enrollments.subscriberId,
			firstName: enrollments.firstName,
			lastName: enrollments.lastName,
			subscriberFirstName: subscribers.firstName,
			subscriberLastName: subscribers.lastName,
			email: enrollments.customerEmail,
			phone: enrollments.phone,
			productTitle: enrollments.productTitle,
			variantTitle: enrollments.variantTitle,
			startDate: enrollments.startDate,
			endDate: enrollments.endDate
		})
		.from(enrollments)
		.leftJoin(subscribers, eq(enrollments.subscriberId, subscribers.id))
		.where(and(newStudentsFilter(start, next), pageFilter))
		.orderBy(
			asc(enrollments.startDate),
			asc(enrollments.lastName),
			asc(enrollments.firstName),
			asc(enrollments.id)
		);

	const students = groupNewStudents(rows);
	if (!pageKeys) return students;
	// Stesso ordine della query sulle chiavi.
	const position = new Map(pageKeys.map((key, index) => [key, index]));
	return students.sort((a, b) => (position.get(a.key) ?? 0) - (position.get(b.key) ?? 0));
}

const NEW_STUDENTS_CSV_HEADERS = [
	'Nome',
	'Cognome',
	'Email',
	'Telefono',
	'Corso',
	'Edizione',
	'Inizio',
	'Fine'
];

/** Separatore dei corsi di una stessa persona nelle celle del CSV. */
const COURSE_SEPARATOR = ' | ';

export function newStudentsCsv(rows: NewStudentRow[]): string {
	return toCsv(
		NEW_STUDENTS_CSV_HEADERS,
		rows.map((row) => {
			const column = (value: (course: NewStudentCourse) => string | null) =>
				row.courses.map((course) => value(course) ?? '').join(COURSE_SEPARATOR);
			return [
				row.firstName,
				row.lastName,
				row.email,
				row.phone,
				column((course) => course.productTitle),
				column((course) => course.variantTitle),
				column((course) => formatDateIT(course.startDate)),
				column((course) => formatDateIT(course.endDate))
			];
		}),
		{ separator: ';', bom: true, lineEnding: '\r\n' }
	);
}
