import type { RequestEvent } from '@sveltejs/kit';
import { eq, and, gte, lte, inArray, asc, SQL } from 'drizzle-orm';
import { db } from '$lib/db';
import { attendance, enrollments, subscribers } from '$lib/db/schema';
import { badRequest, unauthorized, serverError } from '$lib/utils/api';
import { AuthError } from '$lib/services/auth';
import { TIMEZONE } from '$lib/utils/date';
import { formatInTimeZone } from 'date-fns-tz';
import {
	buildSubscriberCourseAttendanceReportRows,
	type SubscriberCourseAttendanceReportInput
} from '$lib/services/subscriber-course-attendance';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function dateKey(value: Date | string | null): string {
	if (!value) return '';
	if (typeof value === 'string') return value.slice(0, 10);
	return formatInTimeZone(value, TIMEZONE, 'yyyy-MM-dd');
}

function csvEscape(value: unknown): string {
	const str = value === null || value === undefined ? '' : String(value);
	return `"${str.replace(/"/g, '""')}"`;
}

function compactDateKey(value: string): string {
	return value.replaceAll('-', '');
}

function emailFilenameSuffix(email: string): string {
	return email.trim().toLowerCase().replace(/[@.]/g, '_').replace(/[^a-z0-9_-]/g, '_');
}

function buildExportFilename(filters: { from?: string; to?: string; email?: string }): string {
	if (filters.email) return `attendance-${emailFilenameSuffix(filters.email)}.csv`;
	return `attendance-${compactDateKey(filters.from!)}-${compactDateKey(filters.to!)}.csv`;
}

const CSV_HEADERS = [
	'nome',
	'email',
	'corso',
	'data_inizio',
	'data_fine',
	'monte_ore',
	'anomalie'
];

function parseExportFilters(url: URL):
	| { ok: true; filters: { from?: string; to?: string; email?: string } }
	| { ok: false; message: string } {
	const from = url.searchParams.get('from')?.trim() || undefined;
	const to = url.searchParams.get('to')?.trim() || undefined;
	const email = url.searchParams.get('email')?.trim() || undefined;
	const hasDateRange = Boolean(from || to);
	const hasEmail = Boolean(email);

	if (hasDateRange && hasEmail) {
		return { ok: false, message: 'Usa il filtro per date oppure quello per email, non entrambi.' };
	}

	if (!hasDateRange && !hasEmail) {
		return { ok: false, message: 'Seleziona un range di date oppure inserisci una email.' };
	}

	if (hasDateRange) {
		if (!from || !to) return { ok: false, message: 'Il range richiede sia data inizio sia data fine.' };
		if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to)) {
			return { ok: false, message: 'Formato data non valido.' };
		}
		if (new Date(from).getTime() > new Date(to).getTime()) {
			return { ok: false, message: 'La data inizio non può essere successiva alla data fine.' };
		}
		return { ok: true, filters: { from, to } };
	}

	if (!email || !email.includes('@')) {
		return { ok: false, message: 'Email non valida.' };
	}

	return { ok: true, filters: { email } };
}

function buildEnrollmentWhere(filters: { from?: string; to?: string; email?: string }): SQL | undefined {
	const conditions: SQL[] = [];

	if (filters.email) conditions.push(eq(subscribers.email, filters.email));
	if (filters.from) conditions.push(gte(enrollments.endDate, new Date(filters.from)));
	if (filters.to) conditions.push(lte(enrollments.startDate, new Date(filters.to)));

	return conditions.length > 0 ? and(...conditions) : undefined;
}

export async function GET(event: RequestEvent): Promise<Response> {
	try {
		await event.locals.verifyAdmin();
	} catch (err) {
		return err instanceof AuthError ? unauthorized(err.message) : serverError();
	}

	const parsed = parseExportFilters(event.url);
	if (!parsed.ok) return badRequest(parsed.message);

	const filename = buildExportFilename(parsed.filters);
	const enrollmentRows = await db
		.select({
			enrollmentId: enrollments.id,
			subscriberId: subscribers.id,
			firstName: subscribers.firstName,
			lastName: subscribers.lastName,
			email: subscribers.email,
			productTitle: enrollments.productTitle,
			variantTitle: enrollments.variantTitle,
			startDate: enrollments.startDate,
			endDate: enrollments.endDate
		})
		.from(enrollments)
		.innerJoin(subscribers, eq(enrollments.subscriberId, subscribers.id))
		.where(buildEnrollmentWhere(parsed.filters))
		.orderBy(asc(subscribers.lastName), asc(subscribers.firstName), asc(enrollments.startDate));

	const subscriberIds = [...new Set(enrollmentRows.map((row) => row.subscriberId))];
	const attendanceRows =
		subscriberIds.length > 0
			? await db
					.select({
						id: attendance.id,
						subscriberId: attendance.subscriberId,
						eventType: attendance.eventType,
						readTimestamp: attendance.readTimestamp
					})
					.from(attendance)
					.where(inArray(attendance.subscriberId, subscriberIds))
					.orderBy(asc(attendance.readTimestamp), asc(attendance.id))
			: [];

	const reportInputsBySubscriber = new Map<number, SubscriberCourseAttendanceReportInput>();

	for (const row of enrollmentRows) {
		const input =
			reportInputsBySubscriber.get(row.subscriberId) ??
			{
				subscriberId: row.subscriberId,
				firstName: row.firstName,
				lastName: row.lastName,
				email: row.email,
				enrollments: [],
				attendanceRows: []
			};

		input.enrollments.push({
			id: row.enrollmentId,
			productTitle: row.productTitle,
			variantTitle: row.variantTitle,
			startDate: row.startDate,
			endDate: row.endDate
		});
		reportInputsBySubscriber.set(row.subscriberId, input);
	}

	for (const row of attendanceRows) {
		if (!row.subscriberId) continue;
		reportInputsBySubscriber.get(row.subscriberId)?.attendanceRows.push(row);
	}

	const reportRows = buildSubscriberCourseAttendanceReportRows([
		...reportInputsBySubscriber.values()
	]);
	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			controller.enqueue(encoder.encode(CSV_HEADERS.join(',') + '\n'));

			for (const row of reportRows) {
				const line =
					[
						csvEscape(row.name),
						csvEscape(row.email),
						csvEscape(row.course),
						csvEscape(dateKey(row.startDate)),
						csvEscape(dateKey(row.endDate)),
						csvEscape(row.totalLabel),
						csvEscape(row.anomalyCount)
					].join(',') + '\n';
				controller.enqueue(encoder.encode(line));
			}

			controller.close();
		}
	});

	return new Response(stream, {
		status: 200,
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
}
