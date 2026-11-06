import { and, eq, gte, inArray, lte, or, sql, type SQL } from 'drizzle-orm';
import { db } from '$lib/db';
import {
	enrollments,
	enrollmentScheduleDays,
	ENROLLMENT_SCHEDULE_MODES,
	type EnrollmentScheduleMode
} from '$lib/db/schema';
import { isDateKey } from '$lib/utils/date';

export interface ApiScheduleDay {
	date: string;
}

export interface EnrollmentSchedule {
	mode: EnrollmentScheduleMode;
	/** Giornate `YYYY-MM-DD` ordinate e senza duplicati; vuoto per i corsi contigui. */
	days: string[];
}

export function isNonContiguousMode(mode: EnrollmentScheduleMode): boolean {
	return mode !== 'CONTIGUOUS';
}

export function isEnrollmentScheduleMode(value: unknown): value is EnrollmentScheduleMode {
	return (ENROLLMENT_SCHEDULE_MODES as readonly unknown[]).includes(value);
}

/**
 * Calendario del corso ricevuto dal remoto. `null` quando `scheduleMode` non e' indicato:
 * in quel caso il calendario gia' salvato resta invariato (nuove iscrizioni: CONTIGUOUS).
 * Per i corsi `NON_CONTIGUOUS*` le giornate sono obbligatorie, altrimenti viene sollevato un
 * errore; per i corsi `CONTIGUOUS` eventuali giornate vengono ignorate.
 */
export function normalizeEnrollmentSchedule(input: {
	scheduleMode?: string | null;
	scheduleDays?: ApiScheduleDay[] | null;
}): EnrollmentSchedule | null {
	const mode = input.scheduleMode;
	if (mode === null || mode === undefined || mode === '') return null;
	if (!isEnrollmentScheduleMode(mode)) throw new Error(`scheduleMode non valido: ${mode}`);
	if (!isNonContiguousMode(mode)) return { mode, days: [] };

	const days = [...new Set((input.scheduleDays ?? []).map((day) => day.date))].sort();
	if (days.length === 0) throw new Error(`scheduleDays obbligatorio per i corsi ${mode}`);
	const invalid = days.find((day) => !isDateKey(day));
	if (invalid !== undefined) throw new Error(`Data non valida in scheduleDays: ${invalid}`);
	return { mode, days };
}

/**
 * Condizione SQL: l'iscrizione prevede una giornata di corso in `dateKey` (giorno Europe/Rome,
 * `YYYY-MM-DD`). I corsi contigui coprono tutto l'intervallo `start_date`..`end_date`, quelli
 * non contigui solo le giornate elencate in `enrollment_schedule_days` dentro l'intervallo.
 *
 * Il giorno e' confrontato come `DATE`: un parametro ISO con `Z` verrebbe convertito nel fuso
 * della sessione MySQL e potrebbe escludere l'ultimo giorno del corso.
 */
export function enrollmentScheduledOn(dateKey: string): SQL {
	const courseDate = sql`cast(${dateKey} as date)`;
	return and(
		lte(enrollments.startDate, courseDate),
		gte(enrollments.endDate, courseDate),
		or(
			eq(enrollments.scheduleMode, 'CONTIGUOUS'),
			sql`exists (select 1 from ${enrollmentScheduleDays} where ${and(
				eq(enrollmentScheduleDays.enrollmentId, enrollments.id),
				eq(enrollmentScheduleDays.courseDate, courseDate)
			)})`
		)
	)!;
}

const IN_CHUNK_SIZE = 1000;

function toDateKey(value: Date | string): string {
	return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

/** Giornate salvate per le iscrizioni indicate, ordinate per data. */
export async function loadScheduleDays(enrollmentIds: number[]): Promise<Map<number, string[]>> {
	const daysByEnrollment = new Map<number, string[]>();
	const ids = [...new Set(enrollmentIds)];
	for (let i = 0; i < ids.length; i += IN_CHUNK_SIZE) {
		const rows = await db
			.select({
				enrollmentId: enrollmentScheduleDays.enrollmentId,
				courseDate: enrollmentScheduleDays.courseDate
			})
			.from(enrollmentScheduleDays)
			.where(inArray(enrollmentScheduleDays.enrollmentId, ids.slice(i, i + IN_CHUNK_SIZE)))
			.orderBy(enrollmentScheduleDays.enrollmentId, enrollmentScheduleDays.courseDate);
		for (const row of rows) {
			const days = daysByEnrollment.get(row.enrollmentId);
			if (days) days.push(toDateKey(row.courseDate));
			else daysByEnrollment.set(row.enrollmentId, [toDateKey(row.courseDate)]);
		}
	}
	return daysByEnrollment;
}

interface ScheduledEnrollment {
	id: number;
	scheduleMode?: EnrollmentScheduleMode | null;
	scheduleDays?: string[] | null;
}

/**
 * Aggiunge `scheduleDays` alle iscrizioni non contigue che non le hanno gia'. Le iscrizioni
 * contigue restano invariate (nessuna query, `scheduleDays` non impostato).
 */
export async function withScheduleDays<T extends ScheduledEnrollment>(
	rows: T[]
): Promise<(T & { scheduleDays?: string[] | null })[]> {
	const pending = new Set(
		rows.filter(
			(row) => row.scheduleMode && isNonContiguousMode(row.scheduleMode) && !row.scheduleDays
		)
	);
	if (pending.size === 0) return rows;

	const daysByEnrollment = await loadScheduleDays([...pending].map((row) => row.id));
	return rows.map((row) =>
		pending.has(row) ? { ...row, scheduleDays: daysByEnrollment.get(row.id) ?? [] } : row
	);
}
