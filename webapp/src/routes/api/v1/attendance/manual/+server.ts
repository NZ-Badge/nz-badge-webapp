import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { AuthError } from '$lib/services/auth';
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
	if (error instanceof AuthError) {
		return json({ error: error.message }, { status: error.code === 'UNAUTHORIZED' ? 401 : 403 });
	}
	if (error instanceof SubscriberAttendanceAdminError) {
		return json({ error: error.message }, { status: error.code === 'NOT_FOUND' ? 404 : 400 });
	}
	console.error('[attendance/manual] request failed:', error);
	return json({ error: 'Errore interno' }, { status: 500 });
}

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const actor = await locals.verifyAdmin();
		const parsed = manualSchema.safeParse(await request.json());
		if (!parsed.success) {
			return json(
				{ error: 'Dati non validi', details: parsed.error.flatten().fieldErrors },
				{ status: 400 }
			);
		}

		const event = await createManualSubscriberAttendance({
			actor,
			subscriberId: parsed.data.subscriberId,
			eventType: parsed.data.eventType,
			readTimestamp: parseSubscriberAttendanceDateTime(parsed.data.readTimestamp),
			note: parsed.data.note
		});
		return json({ event }, { status: 201 });
	} catch (error) {
		return errorResponse(error);
	}
};
