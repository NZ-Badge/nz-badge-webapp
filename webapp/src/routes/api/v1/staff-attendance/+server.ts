import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { AuthError } from '$lib/services/auth';
import {
	createManualStaffAttendance,
	parseRomeLocalDateTime,
	StaffAttendanceError,
	updateStaffAttendanceTimestamp
} from '$lib/services/staff-attendance';

const manualSchema = z.object({
	userId: z.number().int().positive(),
	eventType: z.enum(['entry', 'exit']),
	readTimestamp: z.string(),
	note: z.string().max(255).optional()
});

const updateSchema = z.object({
	id: z.number().int().positive(),
	readTimestamp: z.string()
});

function errorResponse(err: unknown): Response {
	if (err instanceof AuthError) {
		return json({ error: err.message }, { status: err.code === 'UNAUTHORIZED' ? 401 : 403 });
	}
	if (err instanceof StaffAttendanceError) {
		const status =
			err.code === 'NOT_FOUND'
				? 404
				: err.code === 'FORBIDDEN'
					? 403
					: err.code === 'TOO_SOON'
						? 409
						: 400;
		return json({ error: err.message, code: err.code }, { status });
	}
	console.error('[staff-attendance] request failed:', err);
	return json({ error: 'Errore interno' }, { status: 500 });
}

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const actor = await locals.verifyUser();
		const parsed = manualSchema.safeParse(await request.json());
		if (!parsed.success) {
			return json(
				{ error: 'Dati non validi', details: parsed.error.flatten().fieldErrors },
				{ status: 400 }
			);
		}

		const event = await createManualStaffAttendance({
			actor,
			targetUserId: parsed.data.userId,
			eventType: parsed.data.eventType,
			readTimestamp: parseRomeLocalDateTime(parsed.data.readTimestamp),
			note: parsed.data.note
		});
		return json({ event }, { status: 201 });
	} catch (err) {
		return errorResponse(err);
	}
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
	try {
		const actor = await locals.verifyUser();
		const parsed = updateSchema.safeParse(await request.json());
		if (!parsed.success) {
			return json(
				{ error: 'Dati non validi', details: parsed.error.flatten().fieldErrors },
				{ status: 400 }
			);
		}

		const event = await updateStaffAttendanceTimestamp({
			actor,
			attendanceId: parsed.data.id,
			readTimestamp: parseRomeLocalDateTime(parsed.data.readTimestamp)
		});
		return json({ event });
	} catch (err) {
		return errorResponse(err);
	}
};
