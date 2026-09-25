import { and, eq, gte, inArray, like, lt, sql, type SQL } from 'drizzle-orm';
import { fromZonedTime } from 'date-fns-tz';
import { z } from 'zod';
import { db } from '$lib/db';
import { attendance, subscribers, type User } from '$lib/db/schema';
import { addDaysToDateKey, isDateKey, romeDayStart, TIMEZONE } from '$lib/utils/date';
import { logAudit } from './audit';
import { requireStaffManager } from './auth';

export class SubscriberAttendanceAdminError extends Error {
	constructor(
		message: string,
		public readonly code: 'NOT_FOUND' | 'INVALID_TIMESTAMP' | 'INVALID_FILTERS' | 'FORBIDDEN'
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

export interface SubscriberAttendanceFilters {
	/** Primo giorno incluso (yyyy-MM-dd, Europe/Rome). */
	from?: string;
	/** Ultimo giorno incluso (yyyy-MM-dd, Europe/Rome). */
	to?: string;
	/** Testo cercato in nome, cognome ed email dell'iscritto. */
	subscriber?: string;
	/** Testo cercato nell'ID del dispositivo. */
	device?: string;
}

/**
 * Condizioni SQL per i filtri della pagina presenze. Le date sono giorni di calendario in fuso
 * Europe/Rome: [inizio di `from`, inizio del giorno dopo `to`).
 */
export function buildSubscriberAttendanceFilterConditions(
	filters: SubscriberAttendanceFilters
): SQL[] {
	const conditions: SQL[] = [];
	if (filters.from) conditions.push(gte(attendance.readTimestamp, romeDayStart(filters.from)));
	if (filters.to) {
		conditions.push(lt(attendance.readTimestamp, romeDayStart(addDaysToDateKey(filters.to, 1))));
	}
	if (filters.device) conditions.push(like(attendance.deviceId, `%${filters.device}%`));
	if (filters.subscriber) {
		conditions.push(
			inArray(
				attendance.subscriberId,
				db
					.select({ id: subscribers.id })
					.from(subscribers)
					.where(
						sql`CONCAT(${subscribers.firstName}, ' ', ${subscribers.lastName}, ' ', COALESCE(${subscribers.email}, '')) LIKE ${`%${filters.subscriber}%`}`
					)
			)
		);
	}
	return conditions;
}

const emptyToUndefined = (value: unknown) =>
	typeof value === 'string' && value.trim() === '' ? undefined : value;

const dateKeyFilter = z.preprocess(
	emptyToUndefined,
	z.string().refine(isDateKey, 'Data non valida (formato atteso aaaa-mm-gg)').optional()
);
const textFilter = z.preprocess(emptyToUndefined, z.string().trim().max(200).optional());

export const subscriberAttendanceFiltersSchema = z
	.object({
		from: dateKeyFilter,
		to: dateKeyFilter,
		subscriber: textFilter,
		device: textFilter
	})
	.refine((f) => Boolean(f.from || f.to || f.subscriber || f.device), {
		message: 'Specifica almeno un filtro per l’eliminazione multipla'
	})
	.refine((f) => !f.from || !f.to || f.from <= f.to, {
		message: 'La data inizio non può essere successiva alla data fine',
		path: ['to']
	});

const deleteSubscriberAttendanceUnion = z.discriminatedUnion('mode', [
	z.object({
		mode: z.literal('ids'),
		ids: z.array(z.number().int().positive()).min(1).max(1000)
	}),
	z.object({
		mode: z.literal('filters'),
		filters: subscriberAttendanceFiltersSchema
	})
]);

/** Compatibilità con il payload documentato `{ ids: [...] }` senza `mode`. */
export const deleteSubscriberAttendanceSchema = z.preprocess(
	(value) =>
		typeof value === 'object' && value !== null && !('mode' in value) && 'ids' in value
			? { ...value, mode: 'ids' }
			: value,
	deleteSubscriberAttendanceUnion
);

export type DeleteSubscriberAttendanceRequest = z.infer<typeof deleteSubscriberAttendanceUnion>;

/**
 * Elimina presenze degli iscritti per ID oppure per filtri. L'eliminazione per filtri è
 * riservata agli Amministratori e richiede almeno un filtro: non svuota mai la tabella.
 */
export async function deleteSubscriberAttendance(params: {
	actor: User;
	request: DeleteSubscriberAttendanceRequest;
}): Promise<{ deleted: number }> {
	requireStaffManager(params.actor);
	const { request } = params;

	let where: SQL | undefined;
	if (request.mode === 'ids') {
		where = inArray(attendance.id, [...new Set(request.ids)]);
	} else {
		if (params.actor.role !== 'admin') {
			throw new SubscriberAttendanceAdminError(
				'Solo gli Amministratori possono eliminare le presenze per filtro',
				'FORBIDDEN'
			);
		}
		const conditions = buildSubscriberAttendanceFilterConditions(request.filters);
		// Difesa in profondità: lo schema richiede già almeno un filtro.
		if (conditions.length === 0) {
			throw new SubscriberAttendanceAdminError(
				'Specifica almeno un filtro per l’eliminazione multipla',
				'INVALID_FILTERS'
			);
		}
		where = and(...conditions);
	}

	const [result] = await db.delete(attendance).where(where);
	const deleted = result.affectedRows;

	await logAudit({
		userId: params.actor.id,
		action: 'DELETE',
		entityType: 'attendance',
		entityId: request.mode === 'ids' && request.ids.length === 1 ? request.ids[0] : undefined,
		dataBefore:
			request.mode === 'ids'
				? { mode: 'ids', ids: request.ids, count: deleted }
				: { mode: 'filters', filters: request.filters, count: deleted }
	});

	return { deleted };
}
