import { z } from 'zod';
import type { RequestHandler } from './$types';
import { AuthError } from '$lib/services/auth';
import {
	ok,
	created,
	badRequest,
	forbidden,
	notFound,
	conflict,
	serverError,
	authErrorResponse
} from '$lib/utils/api';
import {
	createManualStaffAttendance,
	deleteStaffAttendance,
	parseRomeLocalDateTime,
	StaffAttendanceError,
	updateStaffAttendanceTimestamp
} from '$lib/services/staff-attendance';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api/staff-attendance');

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

const deleteSchema = z.object({ id: z.number().int().positive() });

/** Legge il body JSON della richiesta; `undefined` se non e' JSON valido. */
async function readJson(request: Request): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		return undefined;
	}
}

function errorResponse(err: unknown): Response {
	if (err instanceof AuthError) return authErrorResponse(err);
	if (err instanceof StaffAttendanceError) {
		switch (err.code) {
			case 'NOT_FOUND':
				return notFound(err.message);
			case 'FORBIDDEN':
				return forbidden(err.message);
			case 'TOO_SOON':
				return conflict(err.message);
			default:
				return badRequest(err.message);
		}
	}
	log.error('Request failed', { err });
	return serverError('Errore interno');
}

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const actor = await locals.verifyUser();
		const parsed = manualSchema.safeParse(await readJson(request));
		if (!parsed.success) {
			return badRequest('Dati non validi', parsed.error.flatten().fieldErrors);
		}

		const event = await createManualStaffAttendance({
			actor,
			targetUserId: parsed.data.userId,
			eventType: parsed.data.eventType,
			readTimestamp: parseRomeLocalDateTime(parsed.data.readTimestamp),
			note: parsed.data.note
		});
		return created({ event });
	} catch (err) {
		return errorResponse(err);
	}
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
	try {
		const actor = await locals.verifyUser();
		const parsed = updateSchema.safeParse(await readJson(request));
		if (!parsed.success) {
			return badRequest('Dati non validi', parsed.error.flatten().fieldErrors);
		}

		const event = await updateStaffAttendanceTimestamp({
			actor,
			attendanceId: parsed.data.id,
			readTimestamp: parseRomeLocalDateTime(parsed.data.readTimestamp)
		});
		return ok({ event });
	} catch (err) {
		return errorResponse(err);
	}
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	try {
		const actor = await locals.verifyUser();
		const parsed = deleteSchema.safeParse(await readJson(request));
		if (!parsed.success) return badRequest('Dati non validi');
		await deleteStaffAttendance({ actor, attendanceId: parsed.data.id });
		return ok({ deleted: 1 });
	} catch (err) {
		return errorResponse(err);
	}
};
