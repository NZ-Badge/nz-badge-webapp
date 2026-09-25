/**
 * Risoluzione manuale delle anomalie di presenza (ingressi senza uscita) di un'iscrizione.
 *
 * La pagina `subscribers/[id]/attendance-anomalies/[enrollmentId]` si limita ad auth,
 * parsing dei parametri e traduzione degli esiti in HTTP: calcolo dei limiti, validazione
 * delle ore inserite e scrittura delle uscite (con audit, nella stessa transazione) vivono qui.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '$lib/db';
import { attendance, enrollments, subscribers } from '$lib/db/schema';
import {
	buildSubscriberCourseAttendanceSummary,
	getEnrollmentAttendancePeriod,
	type CourseAttendanceResolvableIssue
} from '$lib/services/subscriber-course-attendance';
import { logAudit } from '$lib/services/audit';

export const MANUAL_FIX_DEVICE_ID = 'admin_manual_fix';
export const MAX_MANUAL_HOURS = 24;

export class AttendanceAnomalyError extends Error {
	constructor(
		message: string,
		public readonly code: 'SUBSCRIBER_NOT_FOUND' | 'ENROLLMENT_NOT_FOUND'
	) {
		super(message);
		this.name = 'AttendanceAnomalyError';
	}
}

export interface ResolutionLimits {
	maxMinutes: number | null;
	maxHours: number | null;
}

export interface AnomalyResolution {
	entryId: number;
	exitAt: Date;
	durationMinutes: number;
	hours: number;
	cardUid: string;
	uidRaw: string | null;
	subscriberId: number | null;
}

interface AttendanceRow {
	id: number;
	cardUid: string;
	uidRaw: string | null;
	subscriberId: number | null;
	deviceId: string;
	eventType: 'entry' | 'exit';
	readTimestamp: Date;
}

export function getHoursFieldName(entryAttendanceId: number): string {
	return `hours_${entryAttendanceId}`;
}

export function parseHours(rawValue: FormDataEntryValue | null): number | null {
	if (typeof rawValue !== 'string') return null;

	const normalized = rawValue.trim().replace(',', '.');
	if (!normalized) return null;

	const hours = Number(normalized);
	if (!Number.isFinite(hours)) return null;

	return hours;
}

/** Ore massime inseribili: fino al prossimo evento, alla fine del periodo o a 24 ore. */
export function buildResolutionLimits(
	issue: CourseAttendanceResolvableIssue,
	periodEnd: number | null
): ResolutionLimits {
	const entryAt = new Date(issue.entryAt).getTime();
	const candidateEnds = [
		issue.nextEventAt ? new Date(issue.nextEventAt).getTime() : null,
		periodEnd
	].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

	if (candidateEnds.length === 0) {
		return { maxMinutes: MAX_MANUAL_HOURS * 60, maxHours: MAX_MANUAL_HOURS };
	}

	const nearestBoundary = Math.min(...candidateEnds);
	const maxMinutes = Math.floor((nearestBoundary - entryAt - 1) / 60000);

	if (maxMinutes <= 0) {
		return { maxMinutes: 0, maxHours: 0 };
	}

	return {
		maxMinutes: Math.min(maxMinutes, MAX_MANUAL_HOURS * 60),
		maxHours: Number((Math.min(maxMinutes, MAX_MANUAL_HOURS * 60) / 60).toFixed(2))
	};
}

export async function loadResolutionContext(subscriberId: number, enrollmentId: number) {
	const [subscriber] = await db
		.select({
			id: subscribers.id,
			firstName: subscribers.firstName,
			lastName: subscribers.lastName,
			email: subscribers.email
		})
		.from(subscribers)
		.where(eq(subscribers.id, subscriberId))
		.limit(1);

	if (!subscriber) {
		throw new AttendanceAnomalyError('Iscritto non trovato', 'SUBSCRIBER_NOT_FOUND');
	}

	const [enrollment] = await db
		.select({
			id: enrollments.id,
			orderName: enrollments.orderName,
			productTitle: enrollments.productTitle,
			variantTitle: enrollments.variantTitle,
			startDate: enrollments.startDate,
			endDate: enrollments.endDate,
			status: enrollments.status
		})
		.from(enrollments)
		.where(and(eq(enrollments.id, enrollmentId), eq(enrollments.subscriberId, subscriberId)))
		.limit(1);

	if (!enrollment) {
		throw new AttendanceAnomalyError('Iscrizione non trovata', 'ENROLLMENT_NOT_FOUND');
	}

	const allAttendance: AttendanceRow[] = await db
		.select({
			id: attendance.id,
			cardUid: attendance.cardUid,
			uidRaw: attendance.uidRaw,
			subscriberId: attendance.subscriberId,
			deviceId: attendance.deviceId,
			eventType: attendance.eventType,
			readTimestamp: attendance.readTimestamp
		})
		.from(attendance)
		.where(eq(attendance.subscriberId, subscriberId))
		.orderBy(attendance.readTimestamp, attendance.id);

	const summary = buildSubscriberCourseAttendanceSummary(enrollment, allAttendance);
	const period = getEnrollmentAttendancePeriod(enrollment);

	return { subscriber, enrollment, allAttendance, summary, period };
}

export type ResolutionContext = Awaited<ReturnType<typeof loadResolutionContext>>;

/** Dati per la pagina: riepilogo e una riga per ogni ingresso risolvibile. */
export async function getAnomalyResolutionView(subscriberId: number, enrollmentId: number) {
	const context = await loadResolutionContext(subscriberId, enrollmentId);
	const periodEnd = context.period?.end ?? null;

	return {
		subscriber: context.subscriber,
		enrollment: context.enrollment,
		summary: context.summary,
		resolutionRows: context.summary.resolvableIssues.map((issue) => ({
			...issue,
			fieldName: getHoursFieldName(issue.entryAttendanceId),
			...buildResolutionLimits(issue, periodEnd)
		}))
	};
}

export type ResolutionValidation =
	| { status: 'no_period' }
	| { status: 'nothing_to_resolve' }
	| { status: 'stale'; values: Record<string, string> }
	| { status: 'invalid'; fieldErrors: Record<string, string>; values: Record<string, string> }
	| { status: 'valid'; resolutions: AnomalyResolution[] };

/**
 * Valida le ore inserite per ogni anomalia e calcola le uscite da creare.
 * Funzione pura: `getValue` legge il valore del campo `hours_<entryId>` dal form.
 */
export function validateAnomalyResolutions(
	context: Pick<ResolutionContext, 'allAttendance' | 'summary' | 'period'>,
	getValue: (fieldName: string) => FormDataEntryValue | null
): ResolutionValidation {
	if (!context.summary.canCalculate || !context.period) {
		return { status: 'no_period' };
	}

	if (context.summary.resolvableIssues.length === 0) {
		return { status: 'nothing_to_resolve' };
	}

	const periodEnd = context.period.end ?? null;
	const attendanceById = new Map(context.allAttendance.map((row) => [row.id, row]));
	const fieldErrors: Record<string, string> = {};
	const values: Record<string, string> = {};
	const resolutions: AnomalyResolution[] = [];

	for (const issue of context.summary.resolvableIssues) {
		const fieldName = getHoursFieldName(issue.entryAttendanceId);
		const rawValue = getValue(fieldName);
		const stringValue = typeof rawValue === 'string' ? rawValue.trim() : '';
		values[fieldName] = stringValue;

		const hours = parseHours(rawValue);
		if (hours === null) {
			fieldErrors[fieldName] = 'Inserisci il numero di ore.';
			continue;
		}

		if (hours <= 0) {
			fieldErrors[fieldName] = 'Le ore devono essere maggiori di zero.';
			continue;
		}

		if (hours > MAX_MANUAL_HOURS) {
			fieldErrors[fieldName] = `Puoi inserire al massimo ${MAX_MANUAL_HOURS} ore.`;
			continue;
		}

		const limits = buildResolutionLimits(issue, periodEnd);
		if (limits.maxHours !== null && hours > limits.maxHours) {
			fieldErrors[fieldName] =
				`Il massimo consentito per questo ingresso è ${limits.maxHours} ore.`;
			continue;
		}

		const entryRow = attendanceById.get(issue.entryAttendanceId);
		if (!entryRow || entryRow.eventType !== 'entry' || !entryRow.cardUid) {
			return { status: 'stale', values };
		}

		const durationMinutes = Math.round(hours * 60);
		const exitAt = new Date(new Date(issue.entryAt).getTime() + durationMinutes * 60_000);

		if (issue.nextEventAt && exitAt.getTime() >= new Date(issue.nextEventAt).getTime()) {
			fieldErrors[fieldName] = 'L’uscita calcolata supera il prossimo evento registrato.';
			continue;
		}

		if (periodEnd !== null && exitAt.getTime() >= periodEnd) {
			fieldErrors[fieldName] = 'L’uscita calcolata esce dal mese associato a questo corso.';
			continue;
		}

		resolutions.push({
			entryId: entryRow.id,
			exitAt,
			durationMinutes,
			hours,
			cardUid: entryRow.cardUid,
			uidRaw: entryRow.uidRaw ?? null,
			subscriberId: entryRow.subscriberId ?? null
		});
	}

	if (Object.keys(fieldErrors).length > 0) {
		return { status: 'invalid', fieldErrors, values };
	}

	return { status: 'valid', resolutions };
}

/** Inserisce le uscite correttive e i relativi audit in un'unica transazione. */
export async function applyAnomalyResolutions(options: {
	subscriberId: number;
	enrollmentId: number;
	resolutions: AnomalyResolution[];
	userId: number;
	ipAddress?: string;
	userAgent?: string;
}): Promise<number[]> {
	const { subscriberId, enrollmentId, resolutions, userId, ipAddress, userAgent } = options;

	return db.transaction(async (tx) => {
		const createdIds: number[] = [];

		for (const resolution of resolutions) {
			const result = await tx.insert(attendance).values({
				cardUid: resolution.cardUid,
				uidRaw: resolution.uidRaw,
				subscriberId: resolution.subscriberId,
				deviceId: MANUAL_FIX_DEVICE_ID,
				eventType: 'exit',
				readTimestamp: resolution.exitAt,
				deviceTimeRaw: resolution.exitAt,
				offlineQueued: false,
				rawPayload: {
					source: 'admin_manual_resolution',
					entryAttendanceId: resolution.entryId,
					enrollmentId,
					durationMinutes: resolution.durationMinutes,
					hours: resolution.hours,
					resolvedByUserId: userId
				},
				validated: true,
				note: `Correzione manuale ingresso #${resolution.entryId}`
			});

			const id = Number(result[0].insertId);
			createdIds.push(id);

			await logAudit(
				{
					userId,
					action: 'CREATE',
					entityType: 'attendance',
					entityId: id,
					dataAfter: {
						subscriberId,
						enrollmentId,
						entryAttendanceId: resolution.entryId,
						durationMinutes: resolution.durationMinutes,
						hours: resolution.hours,
						deviceId: MANUAL_FIX_DEVICE_ID
					},
					ipAddress,
					userAgent
				},
				tx
			);
		}

		return createdIds;
	});
}
