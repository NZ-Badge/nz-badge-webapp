import { db } from '$lib/db';
import { enrollments, subscribers } from '$lib/db/schema';
import { TIMEZONE } from '$lib/utils/date';
import { and, asc, eq, gte, lt } from 'drizzle-orm';
import { formatInTimeZone } from 'date-fns-tz';

function addDays(key: string, days: number): string {
	const date = new Date(`${key}T12:00:00.000Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

export function selectedWeek(value: string | null, now = new Date()) {
	const today = formatInTimeZone(now, TIMEZONE, 'yyyy-MM-dd');
	const parsed =
		value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00.000Z`) : null;
	const requested =
		parsed && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
			? value
			: today;
	const date = new Date(`${requested}T12:00:00.000Z`);
	const start = addDays(requested, -(date.getUTCDay() + 6) % 7);
	return { start, end: addDays(start, 6), next: addDays(start, 7) };
}

export async function getNewStudents(start: string, next: string) {
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
		.where(
			and(
				gte(enrollments.startDate, new Date(`${start}T00:00:00.000Z`)),
				lt(enrollments.startDate, new Date(`${next}T00:00:00.000Z`))
			)
		)
		.orderBy(
			asc(enrollments.startDate),
			asc(enrollments.lastName),
			asc(enrollments.firstName),
			asc(enrollments.id)
		);
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
			row.startDate?.toISOString().slice(0, 10) ?? '',
			row.endDate?.toISOString().slice(0, 10) ?? ''
		]);
	}
	return `\uFEFF${lines.map((line) => line.map(csvCell).join(';')).join('\r\n')}\r\n`;
}
