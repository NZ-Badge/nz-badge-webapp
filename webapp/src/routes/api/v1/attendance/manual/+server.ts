import { z } from 'zod';
import type { RequestHandler } from './$types';
import { AuthError } from '$lib/services/auth';
import { authErrorResponse, badRequest, created, notFound, serverError } from '$lib/utils/api';
import {
	createManualSubscriberAttendance,
	parseSubscriberAttendanceDateTime,
	SubscriberAttendanceAdminError
} from '$lib/services/subscriber-attendance-admin';

const manualSchema = z.object({
	subscriberId: z.number().int().positive(),
	eventType: z.enum(['entry', 'exit']),
	readTimestamp: z.string(),
	note: z.string().max(255).optional()
});

function errorResponse(error: unknown): Response {
	if (error instanceof AuthError) return authErrorResponse(error);
	if (error instanceof SubscriberAttendanceAdminError) {
		return error.code === 'NOT_FOUND' ? notFound(error.message) : badRequest(error.message);
	}
	console.error('[attendance/manual] request failed:', error);
	return serverError('Errore interno');
}

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const actor = await locals.verifyStaffOrAdmin();
		let body: unknown;
		try {
			body = await request.json();
		} catch {
			return badRequest('JSON non valido');
		}
		const parsed = manualSchema.safeParse(body);
		if (!parsed.success) {
			return badRequest('Dati non validi', parsed.error.flatten().fieldErrors);
		}

		const event = await createManualSubscriberAttendance({
			actor,
			subscriberId: parsed.data.subscriberId,
			eventType: parsed.data.eventType,
			readTimestamp: parseSubscriberAttendanceDateTime(parsed.data.readTimestamp),
			note: parsed.data.note
		});
		return created({ event });
	} catch (error) {
		return errorResponse(error);
	}
};
