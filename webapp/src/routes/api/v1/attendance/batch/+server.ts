import type { RequestEvent } from '@sveltejs/kit';
import { attendanceBatchSchema } from '$lib/utils/validation';
import {
	multiStatus,
	badRequest,
	unauthorized,
	tooManyRequests,
	serverError,
	formatZodError
} from '$lib/utils/api';
import { processBatchAttendance } from '$lib/services/attendance';
import { AuthError } from '$lib/services/auth';
import { createDeviceRateLimiter } from '$lib/services/device-rate-limit';

// Per-device rate limiter: max 10 requests per 1-second rolling window
const deviceRateLimiter = createDeviceRateLimiter(10, 1000);

export async function POST(event: RequestEvent): Promise<Response> {
	let device;
	try {
		device = await event.locals.verifyDevice();
	} catch (err) {
		return err instanceof AuthError ? unauthorized(err.message) : serverError();
	}

	const deviceId = event.request.headers.get('X-Device-ID') ?? device.deviceId;
	if (deviceRateLimiter.isLimited(deviceId)) {
		return tooManyRequests(1);
	}

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return badRequest('Invalid JSON body');
	}

	console.log('[attendance/batch] Received body:', JSON.stringify(body));

	const parsed = attendanceBatchSchema.safeParse(body);
	if (!parsed.success) {
		console.error('[attendance/batch] Validation error:', parsed.error);
		return badRequest(formatZodError(parsed.error));
	}

	// Schema already enforces max 10 events, but double-check
	if (parsed.data.events.length > 10) {
		return badRequest('Batch exceeds maximum of 10 events');
	}

	try {
		const result = await processBatchAttendance(
			parsed.data.events,
			deviceId,
			parsed.data.batch_info,
			parsed.data.queue_status
		);
		return multiStatus({
			accepted: result.accepted,
			rejected: result.rejected,
			server_time: result.server_time,
			results: result.results,
			actions: result.actions
		});
	} catch (err) {
		console.error('[attendance/batch] processBatchAttendance error:', err);
		return serverError();
	}
}
