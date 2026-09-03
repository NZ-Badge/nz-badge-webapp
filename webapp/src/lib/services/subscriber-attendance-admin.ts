import { eq } from 'drizzle-orm';
import { fromZonedTime } from 'date-fns-tz';
import { db } from '$lib/db';
import { attendance, type User } from '$lib/db/schema';
import { TIMEZONE } from '$lib/utils/date';
import { logAudit } from './audit';
import { requireStaffManager } from './auth';

export class SubscriberAttendanceAdminError extends Error {
	constructor(
		message: string,
		public readonly code: 'NOT_FOUND' | 'INVALID_TIMESTAMP'
	) {
		super(message);
		this.name = 'SubscriberAttendanceAdminError';
	}
}

export function parseSubscriberAttendanceDateTime(value: string): Date {
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) {
		throw new SubscriberAttendanceAdminError('Data e ora non valide', 'INVALID_TIMESTAMP');
	}

	const parsed = fromZonedTime(value, TIMEZONE);
	if (!Number.isFinite(parsed.getTime())) {
		throw new SubscriberAttendanceAdminError('Data e ora non valide', 'INVALID_TIMESTAMP');
	}

	return parsed;
}

export async function updateSubscriberAttendanceTimestamp(params: {
	actor: User;
	attendanceId: number;
	readTimestamp: Date;
}): Promise<typeof attendance.$inferSelect> {
	requireStaffManager(params.actor);
	if (!Number.isFinite(params.readTimestamp.getTime())) {
		throw new SubscriberAttendanceAdminError('Data e ora non valide', 'INVALID_TIMESTAMP');
	}

	const [current] = await db
		.select()
		.from(attendance)
		.where(eq(attendance.id, params.attendanceId))
		.limit(1);
	if (!current) {
		throw new SubscriberAttendanceAdminError('Presenza non trovata', 'NOT_FOUND');
	}

	await db
		.update(attendance)
		.set({ readTimestamp: params.readTimestamp })
		.where(eq(attendance.id, params.attendanceId));

	const [updated] = await db
		.select()
		.from(attendance)
		.where(eq(attendance.id, params.attendanceId))
		.limit(1);

	await logAudit({
		userId: params.actor.id,
		action: 'UPDATE',
		entityType: 'attendance',
		entityId: params.attendanceId,
		dataBefore: { readTimestamp: current.readTimestamp.toISOString() },
		dataAfter: { readTimestamp: params.readTimestamp.toISOString() }
	});

	return updated;
}
