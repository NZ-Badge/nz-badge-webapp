import type { RequestEvent } from '@sveltejs/kit';
import { eq, and, gte, lte, asc, SQL } from 'drizzle-orm';
import { db } from '$lib/db';
import { attendance, subscribers } from '$lib/db/schema';
import { attendanceQuerySchema } from '$lib/utils/validation';
import { badRequest, unauthorized, serverError, formatZodError } from '$lib/utils/api';
import { AuthError } from '$lib/services/auth';

function buildWhere(filters: {
	from?: string;
	to?: string;
	device_id?: string;
	subscriber_id?: number;
}): SQL | undefined {
	const conditions: SQL[] = [];
	if (filters.from)
		conditions.push(gte(attendance.readTimestamp, new Date(filters.from + 'T00:00:00.000Z')));
	if (filters.to)
		conditions.push(lte(attendance.readTimestamp, new Date(filters.to + 'T23:59:59.999Z')));
	if (filters.device_id) conditions.push(eq(attendance.deviceId, filters.device_id));
	if (filters.subscriber_id) conditions.push(eq(attendance.subscriberId, filters.subscriber_id));
	return conditions.length > 0 ? and(...conditions) : undefined;
}

function csvEscape(value: unknown): string {
	const str = value === null || value === undefined ? '' : String(value);
	return `"${str.replace(/"/g, '""')}"`;
}

const CSV_HEADERS = [
	'id',
	'date',
	'time',
	'first_name',
	'last_name',
	'card_uid',
	'device_id',
	'event_type',
	'offline_queued',
	'validated'
];

export async function GET(event: RequestEvent): Promise<Response> {
	try {
		await event.locals.verifyAdmin();
	} catch (err) {
		return err instanceof AuthError ? unauthorized(err.message) : serverError();
	}

	// Use attendanceQuerySchema but strip page/limit (export has no pagination)
	const params = Object.fromEntries(event.url.searchParams);
	const parsed = attendanceQuerySchema.safeParse(params);
	if (!parsed.success) return badRequest(formatZodError(parsed.error));

	const { from, to, device_id, subscriber_id } = parsed.data;
	const where = buildWhere({ from, to, device_id, subscriber_id });
	const today = new Date().toISOString().split('T')[0];

	const CHUNK_SIZE = 500;
	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			// Write CSV header
			controller.enqueue(encoder.encode(CSV_HEADERS.join(',') + '\n'));

			let offset = 0;
			while (true) {
				const rows = await db
					.select({ record: attendance, firstName: subscribers.firstName, lastName: subscribers.lastName })
					.from(attendance)
					.leftJoin(subscribers, eq(attendance.subscriberId, subscribers.id))
					.where(where)
					.orderBy(asc(attendance.readTimestamp))
					.limit(CHUNK_SIZE)
					.offset(offset);

				for (const { record, firstName, lastName } of rows) {
					const ts = record.readTimestamp;
					const date =
						ts instanceof Date ? ts.toISOString().split('T')[0] : String(ts).split('T')[0];
					const time = ts instanceof Date ? ts.toISOString().split('T')[1]?.split('.')[0] : '';
					const line =
						[
							csvEscape(record.id),
							csvEscape(date),
							csvEscape(time),
							csvEscape(firstName),
							csvEscape(lastName),
							csvEscape(record.cardUid),
							csvEscape(record.deviceId),
							csvEscape(record.eventType),
							csvEscape(record.offlineQueued),
							csvEscape(record.validated)
						].join(',') + '\n';
					controller.enqueue(encoder.encode(line));
				}

				if (rows.length < CHUNK_SIZE) break;
				offset += CHUNK_SIZE;
			}

			controller.close();
		}
	});

	return new Response(stream, {
		status: 200,
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="attendance-${today}.csv"`
		}
	});
}
