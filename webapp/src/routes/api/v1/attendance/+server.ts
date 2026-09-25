import type { RequestEvent } from '@sveltejs/kit';
import { z } from 'zod';
import { attendanceSingleSchema } from '$lib/utils/validation';
import {
	ok,
	badRequest,
	notFound,
	forbidden,
	tooManyRequests,
	serverError,
	formatZodError,
	authErrorResponse
} from '$lib/utils/api';
import { processSingleAttendance } from '$lib/services/attendance';
import {
	deleteSubscriberAttendance,
	deleteSubscriberAttendanceSchema,
	parseSubscriberAttendanceDateTime,
	SubscriberAttendanceAdminError,
	updateSubscriberAttendanceTimestamp
} from '$lib/services/subscriber-attendance-admin';
import { AuthError } from '$lib/services/auth';
import { createDeviceRateLimiter } from '$lib/services/device-rate-limit';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api/attendance');

// Per-device rate limiter: max 10 requests per 1-second rolling window
const deviceRateLimiter = createDeviceRateLimiter(10, 1000);

const updateTimestampSchema = z.object({
	id: z.number().int().positive(),
	readTimestamp: z.string()
});

export async function POST(event: RequestEvent): Promise<Response> {
	// Auth
	let device;
	try {
		device = await event.locals.verifyDevice();
	} catch (err) {
		return authErrorResponse(err);
	}

	// Rate limit
	const deviceId = event.request.headers.get('X-Device-ID') ?? device.deviceId;
	if (deviceRateLimiter.isLimited(deviceId)) {
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
		log.error('processSingleAttendance failed', { err });
		return serverError();
	}
}

export async function PATCH(event: RequestEvent): Promise<Response> {
	let actor;
	try {
		actor = await event.locals.verifyStaffOrAdmin();
	} catch (err) {
		return authErrorResponse(err);
	}

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return badRequest('JSON non valido');
	}

	const parsed = updateTimestampSchema.safeParse(body);
	if (!parsed.success) {
		return badRequest('Dati non validi', parsed.error.flatten().fieldErrors);
	}

	try {
		const updated = await updateSubscriberAttendanceTimestamp({
			actor,
			attendanceId: parsed.data.id,
			readTimestamp: parseSubscriberAttendanceDateTime(parsed.data.readTimestamp)
		});
		return ok({ event: updated });
	} catch (err) {
		if (err instanceof SubscriberAttendanceAdminError) {
			return err.code === 'NOT_FOUND' ? notFound(err.message) : badRequest(err.message);
		}
		log.error('PATCH failed', { err });
		return serverError();
	}
}

export async function DELETE(event: RequestEvent): Promise<Response> {
	let actor;
	try {
		actor = await event.locals.verifyStaffOrAdmin();
	} catch (err) {
		return authErrorResponse(err);
	}

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return badRequest('JSON non valido');
	}

	const parsed = deleteSubscriberAttendanceSchema.safeParse(body);
	if (!parsed.success) return badRequest(formatZodError(parsed.error));

	try {
		const result = await deleteSubscriberAttendance({ actor, request: parsed.data });
		return ok(result);
	} catch (err) {
		if (err instanceof SubscriberAttendanceAdminError) {
			return err.code === 'FORBIDDEN' ? forbidden(err.message) : badRequest(err.message);
		}
		if (err instanceof AuthError) return forbidden(err.message);
		log.error('DELETE failed', { err });
		return serverError();
	}
}
