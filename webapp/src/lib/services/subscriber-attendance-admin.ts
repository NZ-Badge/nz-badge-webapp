import { eq } from 'drizzle-orm';
import { fromZonedTime } from 'date-fns-tz';
import { db } from '$lib/db';
import { attendance, subscribers, type User } from '$lib/db/schema';
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

export async function createManualSubscriberAttendance(params: {
	actor: User;
	subscriberId: number;
	eventType: 'entry' | 'exit';
	readTimestamp: Date;
	note?: string | null;
}): Promise<typeof attendance.$inferSelect> {
	requireStaffManager(params.actor);
	if (!Number.isFinite(params.readTimestamp.getTime())) {
		throw new SubscriberAttendanceAdminError('Data e ora non valide', 'INVALID_TIMESTAMP');
	}
	if (params.readTimestamp.getTime() > Date.now() + 60_000) {
		throw new SubscriberAttendanceAdminError(
			'Non è possibile inserire un evento futuro',
			'INVALID_TIMESTAMP'
		);
	}

	const [subscriber] = await db
		.select({ id: subscribers.id })
		.from(subscribers)
		.where(eq(subscribers.id, params.subscriberId))
		.limit(1);
	if (!subscriber) {
		throw new SubscriberAttendanceAdminError('Iscritto non trovato', 'NOT_FOUND');
	}

	const manualUid = `manual-${params.subscriberId.toString(36)}`;
	const [inserted] = await db.insert(attendance).values({
		cardUid: manualUid,
		subscriberId: params.subscriberId,
		deviceId: 'web-manual',
		eventType: params.eventType,
		readTimestamp: params.readTimestamp,
		deviceTimeRaw: params.readTimestamp,
		offlineQueued: false,
		rawPayload: { source: 'manual', createdByUserId: params.actor.id },
		validated: true,
		note: params.note?.trim() || null
	});
	const id = Number(inserted.insertId);
	const [created] = await db.select().from(attendance).where(eq(attendance.id, id)).limit(1);

	await logAudit({
		userId: params.actor.id,
		action: 'CREATE',
		entityType: 'attendance',
		entityId: id,
		dataAfter: {
			subscriberId: params.subscriberId,
			eventType: params.eventType,
			readTimestamp: params.readTimestamp.toISOString(),
			source: 'manual'
		}
	});

	return created;
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
