import type { RequestEvent } from '@sveltejs/kit';
import { attendanceSingleSchema } from '$lib/utils/validation';
import {
	ok,
	badRequest,
	unauthorized,
	tooManyRequests,
	serverError,
	formatZodError
} from '$lib/utils/api';
import { processSingleAttendance } from '$lib/services/attendance';
import { AuthError } from '$lib/services/auth';
import { db } from '$lib/db';
import { attendance, subscribers } from '$lib/db/schema';
import { and, gte, inArray, like, lte, sql } from 'drizzle-orm';

// Per-device rate limiter: max 10 requests per 1-second rolling window
const deviceRequestLog = new Map<string, number[]>();

function checkRateLimit(deviceId: string, maxRequests = 10, windowMs = 1000): boolean {
	const now = Date.now();
	const timestamps = (deviceRequestLog.get(deviceId) ?? []).filter((t) => now - t < windowMs);
	timestamps.push(now);
	deviceRequestLog.set(deviceId, timestamps);
	return timestamps.length > maxRequests; // true = limit exceeded
}

export async function POST(event: RequestEvent): Promise<Response> {
	// Auth
	let device;
	try {
		device = await event.locals.verifyDevice();
	} catch (err) {
		return err instanceof AuthError ? unauthorized(err.message) : serverError();
	}

	// Rate limit
	const deviceId = event.request.headers.get('X-Device-ID') ?? device.deviceId;
	if (checkRateLimit(deviceId)) {
		return tooManyRequests(1);
	}

	// Parse body
	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return badRequest('Invalid JSON body');
	}

	const parsed = attendanceSingleSchema.safeParse(body);
	if (!parsed.success) return badRequest(formatZodError(parsed.error));

	// Process
	try {
		const result = await processSingleAttendance(
			parsed.data.events,
			deviceId,
			parsed.data.queue_status
		);

		return ok({
			accepted: result.accepted,
			rejected: result.rejected,
			server_time: result.server_time,
			actions: result.actions
		});
	} catch (err) {
		console.error('[attendance] processSingleAttendance error:', err);
		return serverError();
	}
}

export async function DELETE(event: RequestEvent): Promise<Response> {
	try {
		await event.locals.verifyAdmin();
	} catch (err) {
		return err instanceof AuthError ? unauthorized(err.message) : serverError();
	}

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return badRequest('Invalid JSON body');
	}

	try {
		if (
			typeof body === 'object' &&
			body !== null &&
			'all' in body &&
			(body as { all: unknown }).all === true
		) {
			// Delete all matching filters
			const f = (body as { filters?: Record<string, string> }).filters ?? {};
			const filters = [];
			if (f.from) filters.push(gte(attendance.readTimestamp, new Date(f.from)));
			if (f.to) {
				const toDate = new Date(f.to);
				toDate.setDate(toDate.getDate() + 1);
				filters.push(lte(attendance.readTimestamp, toDate));
			}
			if (f.device) filters.push(like(attendance.deviceId, `%${f.device}%`));
			if (f.subscriber) {
				// Need to join subscribers to filter by name — collect IDs first
				const matchingSubscribers = await db
					.select({ id: subscribers.id })
					.from(subscribers)
					.where(
						sql`CONCAT(${subscribers.firstName}, ' ', ${subscribers.lastName}, ' ', COALESCE(${subscribers.email}, '')) LIKE ${`%${f.subscriber}%`}`
					);
				const subIds = matchingSubscribers.map((s) => s.id);
				if (subIds.length === 0) return ok({ deleted: 0 });
				filters.push(inArray(attendance.subscriberId, subIds));
			}
			const whereClause = filters.length > 0 ? and(...filters) : undefined;
			const result = await db.delete(attendance).where(whereClause);
			return ok({ deleted: result[0].affectedRows });
		} else if (typeof body === 'object' && body !== null && 'ids' in body) {
			const ids = (body as { ids: unknown }).ids;
			if (!Array.isArray(ids) || ids.length === 0)
				return badRequest('ids must be a non-empty array');
			const numericIds = ids.map(Number).filter((n) => !isNaN(n) && n > 0);
			if (numericIds.length === 0) return badRequest('No valid IDs provided');
			const result = await db.delete(attendance).where(inArray(attendance.id, numericIds));
			return ok({ deleted: result[0].affectedRows });
		} else {
			return badRequest('Body must contain ids or all:true with filters');
		}
	} catch (err) {
		console.error('[attendance] DELETE error:', err);
		return serverError();
	}
}
