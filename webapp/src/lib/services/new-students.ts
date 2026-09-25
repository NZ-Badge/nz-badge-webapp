import { db } from '$lib/db';
import { enrollments, subscribers } from '$lib/db/schema';
import { addDaysToDateKey, dateKeySchema, formatDateIT, romeDateKey } from '$lib/utils/date';
import { toCsv } from '$lib/utils/csv';
import { and, asc, count, eq, gte, lt } from 'drizzle-orm';

export function selectedDateRange(from: string | null, to: string | null, now = new Date()) {
	const today = romeDateKey(now);
	const date = new Date(`${today}T12:00:00.000Z`);
	const weekStart = addDaysToDateKey(today, -(date.getUTCDay() + 6) % 7);
	const start = from === null ? weekStart : dateKeySchema.parse(from);
	const end = to === null ? addDaysToDateKey(weekStart, 6) : dateKeySchema.parse(to);
	if (start > end) throw new RangeError('La data Da deve precedere o coincidere con la data A.');
	return { start, end, next: addDaysToDateKey(end, 1) };
}

function inDateRange(start: string, next: string) {
	return and(
		gte(enrollments.startDate, new Date(`${start}T00:00:00.000Z`)),
		lt(enrollments.startDate, new Date(`${next}T00:00:00.000Z`))
	);
}

export async function countNewStudents(start: string, next: string): Promise<number> {
	const [{ total }] = await db
		.select({ total: count() })
		.from(enrollments)
		.where(inDateRange(start, next));
	return total;
}

export async function getNewStudents(
	start: string,
	next: string,
	pagination?: { limit: number; offset: number }
) {
	const query = db
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
		.where(inDateRange(start, next))
		.orderBy(
			asc(enrollments.startDate),
			asc(enrollments.lastName),
			asc(enrollments.firstName),
			asc(enrollments.id)
		);
	const rows = await (pagination ? query.limit(pagination.limit).offset(pagination.offset) : query);
	return rows.map(({ subscriberFirstName, subscriberLastName, ...row }) => ({
		...row,
		firstName: subscriberFirstName ?? row.firstName ?? '',
		lastName: subscriberLastName ?? row.lastName ?? ''
	}));
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

export function newStudentsCsv(rows: Awaited<ReturnType<typeof getNewStudents>>): string {
	return toCsv(
		NEW_STUDENTS_CSV_HEADERS,
		rows.map((row) => [
			row.firstName,
			row.lastName,
			row.email,
			row.phone,
			row.productTitle,
			row.variantTitle,
			formatDateIT(row.startDate),
			formatDateIT(row.endDate)
		]),
		{ separator: ';', bom: true, lineEnding: '\r\n' }
	);
}
