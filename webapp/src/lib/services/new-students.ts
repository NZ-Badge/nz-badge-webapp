import { db } from '$lib/db';
import { enrollments, subscribers } from '$lib/db/schema';
import { formatDateIT, TIMEZONE } from '$lib/utils/date';
import { and, asc, count, eq, gte, lt } from 'drizzle-orm';
import { formatInTimeZone } from 'date-fns-tz';
import { z } from 'zod';

function addDays(key: string, days: number): string {
	const date = new Date(`${key}T12:00:00.000Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

const dateKeySchema = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/)
	.refine((value) => {
		const date = new Date(`${value}T12:00:00.000Z`);
		return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
	});

export function selectedDateRange(from: string | null, to: string | null, now = new Date()) {
	const today = formatInTimeZone(now, TIMEZONE, 'yyyy-MM-dd');
	const date = new Date(`${today}T12:00:00.000Z`);
	const weekStart = addDays(today, -(date.getUTCDay() + 6) % 7);
	const start = from === null ? weekStart : dateKeySchema.parse(from);
	const end = to === null ? addDays(weekStart, 6) : dateKeySchema.parse(to);
	if (start > end) throw new RangeError('La data Da deve precedere o coincidere con la data A.');
	return { start, end, next: addDays(end, 1) };
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

function csvCell(value: string): string {
	// Spreadsheet programs can execute formulas in imported text cells.
	const safe = /^[\s]*[=+@-]/.test(value) ? `'${value}` : value;
	return `"${safe.replaceAll('"', '""')}"`;
}

export function newStudentsCsv(rows: Awaited<ReturnType<typeof getNewStudents>>): string {
	const lines = [['Nome', 'Cognome', 'Email', 'Telefono', 'Corso', 'Edizione', 'Inizio', 'Fine']];
	for (const row of rows) {
		lines.push([
			row.firstName,
			row.lastName,
			row.email,
			row.phone ?? '',
			row.productTitle ?? '',
			row.variantTitle ?? '',
			formatDateIT(row.startDate),
			formatDateIT(row.endDate)
		]);
	}
	return `\uFEFF${lines.map((line) => line.map(csvCell).join(';')).join('\r\n')}\r\n`;
}
