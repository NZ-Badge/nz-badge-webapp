/**
 * Unione degli iscritti duplicati: una stessa persona importata come più subscriber
 * (uno per corso) diventa un solo subscriber con tutte le iscrizioni, card, presenze
 * e riepiloghi settimanali.
 *
 * Il criterio è lo stesso della sync (`findMatchingSubscriber` in `enrollments.ts`):
 * stesso nome e cognome e stesso codice fiscale oppure stessa email.
 *
 * Importa solo percorsi relativi: è usato anche da `scripts/merge-duplicate-subscribers.ts`.
 */
import { and, count, eq, inArray, sql } from 'drizzle-orm';
import {
	attendance,
	auditLog,
	cardRfid,
	enrollments,
	subscribers,
	weeklyAttendanceSummaryLog
} from '../db/schema';
import type { AppDatabase, DbOrTx } from '../db/types';

type SubscriberStatus = 'active' | 'completed' | 'suspended' | 'cancelled';

export interface MergeCandidate {
	id: number;
	firstName: string;
	lastName: string;
	email: string;
	phone: string | null;
	taxId: string | null;
	note: string | null;
	status: SubscriberStatus | null;
	courseName: string | null;
	courseStartDate: Date | string | null;
	courseEndDate: Date | string | null;
	activeRfidCards: number;
	activeNfcCards: number;
	enrollmentCount: number;
}

export interface MergePlan {
	survivor: MergeCandidate;
	duplicates: MergeCandidate[];
	/** Campi del subscriber superstite da aggiornare (vuoto se non cambia nulla). */
	survivorUpdate: Partial<
		Pick<
			MergeCandidate,
			'phone' | 'taxId' | 'note' | 'status' | 'courseName' | 'courseStartDate' | 'courseEndDate'
		>
	>;
	/** Motivi per cui il gruppo non può essere unito automaticamente. */
	conflicts: string[];
}

export interface MergeOptions {
	preserveSurvivorData?: boolean;
}

export interface MergeGroupResult {
	survivorId: number;
	mergedIds: number[];
	moved: { enrollments: number; cards: number; attendance: number; weeklySummaries: number };
	droppedWeeklySummaries: number;
}

// ── Raggruppamento ────────────────────────────────────────────────────────────

/** Normalizzazione allineata alla collation case/accent-insensitive di MySQL. */
function normalizeText(value: string | null | undefined): string {
	return (value ?? '')
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

function identityKeys(candidate: MergeCandidate): string[] {
	const firstName = normalizeText(candidate.firstName);
	const lastName = normalizeText(candidate.lastName);
	if (!firstName || !lastName) return [];

	const person = `${firstName}|${lastName}`;
	const keys: string[] = [];
	const taxId = normalizeText(candidate.taxId);
	const email = normalizeText(candidate.email);
	if (taxId) keys.push(`${person}|tax:${taxId}`);
	if (email) keys.push(`${person}|email:${email}`);
	return keys;
}

/**
 * Gruppi (almeno due id, ordinati) di subscriber che rappresentano la stessa persona.
 * L'unione è transitiva: A-B per codice fiscale e B-C per email finiscono nello stesso gruppo.
 */
export function findDuplicateGroups(candidates: MergeCandidate[]): number[][] {
	const parent = new Map<number, number>();
	const find = (id: number): number => {
		let root = id;
		while (parent.get(root) !== root) root = parent.get(root)!;
		parent.set(id, root);
		return root;
	};
	const union = (left: number, right: number) => {
		const a = find(left);
		const b = find(right);
		if (a !== b) parent.set(Math.max(a, b), Math.min(a, b));
	};

	const firstByKey = new Map<string, number>();
	for (const candidate of candidates) {
		parent.set(candidate.id, candidate.id);
		for (const key of identityKeys(candidate)) {
			const first = firstByKey.get(key);
			if (first === undefined) firstByKey.set(key, candidate.id);
			else union(first, candidate.id);
		}
	}

	const groups = new Map<number, number[]>();
	for (const candidate of candidates) {
		const root = find(candidate.id);
		const group = groups.get(root);
		if (group) group.push(candidate.id);
		else groups.set(root, [candidate.id]);
	}

	return [...groups.values()]
		.filter((group) => group.length > 1)
		.map((group) => group.sort((a, b) => a - b))
		.sort((a, b) => a[0] - b[0]);
}

// ── Piano di unione ───────────────────────────────────────────────────────────

function isBlank(value: string | null | undefined): boolean {
	return !value || value.trim() === '';
}

function dateTime(value: Date | string | null): number {
	if (!value) return Number.NEGATIVE_INFINITY;
	const time = new Date(value).getTime();
	return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

/**
 * Superstite: chi ha una card attiva (è quella che il reader riconosce), poi chi non è
 * annullato, poi chi ha più iscrizioni, infine l'id più basso (il primo importato).
 */
function survivorRank(candidate: MergeCandidate): number[] {
	return [
		candidate.activeRfidCards + candidate.activeNfcCards > 0 ? 0 : 1,
		candidate.status === 'cancelled' ? 1 : 0,
		-candidate.enrollmentCount,
		candidate.id
	];
}

function compareRank(left: MergeCandidate, right: MergeCandidate): number {
	const a = survivorRank(left);
	const b = survivorRank(right);
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
	return 0;
}

export function planMerge(group: MergeCandidate[], options: MergeOptions = {}): MergePlan {
	if (group.length < 2) throw new Error('A merge group needs at least two subscribers');

	const ordered = [...group].sort(compareRank);
	const [survivor, ...duplicates] = ordered;
	const byId = [...group].sort((a, b) => a.id - b.id);

	const conflicts: string[] = [];
	if (group.filter((c) => c.activeRfidCards > 0).length > 1) {
		conflicts.push('più di un subscriber ha una card RFID attiva');
	}
	if (group.filter((c) => c.activeNfcCards > 0).length > 1) {
		conflicts.push('più di un subscriber ha un abbinamento NFC attivo');
	}
	const taxIds = new Set(group.map((c) => normalizeText(c.taxId)).filter((taxId) => taxId !== ''));
	if (taxIds.size > 1) conflicts.push('codici fiscali diversi');

	const survivorUpdate: MergePlan['survivorUpdate'] = {};

	for (const field of ['phone', 'taxId'] as const) {
		if (isBlank(survivor[field])) {
			const value = byId.find((c) => !isBlank(c[field]))?.[field];
			if (value) survivorUpdate[field] = value;
		}
	}

	const notes = [...new Set(byId.map((c) => c.note?.trim() ?? '').filter(Boolean))];
	const mergedNote = notes.join('\n');
	if (mergedNote && mergedNote !== (survivor.note?.trim() ?? '')) survivorUpdate.note = mergedNote;

	if (survivor.status === 'cancelled') {
		const status = ordered.find((c) => c.status && c.status !== 'cancelled')?.status;
		if (status) survivorUpdate.status = status;
	}

	// Campi corso legacy: quelli del corso più recente del gruppo.
	const latestCourse = [...group].sort(
		(a, b) => dateTime(b.courseStartDate) - dateTime(a.courseStartDate) || b.id - a.id
	)[0];
	if (latestCourse.id !== survivor.id) {
		survivorUpdate.courseName = latestCourse.courseName;
		survivorUpdate.courseStartDate = latestCourse.courseStartDate;
		survivorUpdate.courseEndDate = latestCourse.courseEndDate;
	}

	return {
		survivor,
		duplicates,
		survivorUpdate: options.preserveSurvivorData ? {} : survivorUpdate,
		conflicts
	};
}

// ── Accesso al database ───────────────────────────────────────────────────────

async function loadCandidates(database: DbOrTx, ids?: number[]): Promise<MergeCandidate[]> {
	const subscriberQuery = database
		.select({
			id: subscribers.id,
			firstName: subscribers.firstName,
			lastName: subscribers.lastName,
			email: subscribers.email,
			phone: subscribers.phone,
			taxId: subscribers.taxId,
			note: subscribers.note,
			status: subscribers.status,
			courseName: subscribers.courseName,
			courseStartDate: subscribers.courseStartDate,
			courseEndDate: subscribers.courseEndDate
		})
		.from(subscribers);

	const [rows, cardRows, enrollmentRows] = await Promise.all([
		ids ? subscriberQuery.where(inArray(subscribers.id, ids)).for('update') : subscriberQuery,
		database
			.select({ subscriberId: cardRfid.subscriberId, type: cardRfid.type, total: count() })
			.from(cardRfid)
			.where(
				and(
					eq(cardRfid.status, 'active'),
					ids ? inArray(cardRfid.subscriberId, ids) : sql`${cardRfid.subscriberId} is not null`
				)
			)
			.groupBy(cardRfid.subscriberId, cardRfid.type),
		database
			.select({ subscriberId: enrollments.subscriberId, total: count() })
			.from(enrollments)
			.where(
				ids ? inArray(enrollments.subscriberId, ids) : sql`${enrollments.subscriberId} is not null`
			)
			.groupBy(enrollments.subscriberId)
	]);

	const rfid = new Map<number, number>();
	const nfc = new Map<number, number>();
	for (const row of cardRows) {
		if (row.subscriberId == null) continue;
		const target = row.type === 'nfc' ? nfc : rfid;
		target.set(row.subscriberId, (target.get(row.subscriberId) ?? 0) + row.total);
	}
	const enrollmentCounts = new Map(enrollmentRows.map((row) => [row.subscriberId, row.total]));

	return rows.map((row) => ({
		...row,
		activeRfidCards: rfid.get(row.id) ?? 0,
		activeNfcCards: nfc.get(row.id) ?? 0,
		enrollmentCount: enrollmentCounts.get(row.id) ?? 0
	}));
}

/** Piani di unione per tutti i duplicati presenti (sola lettura). */
export async function planDuplicateSubscriberMerges(
	database: AppDatabase,
	options: MergeOptions = {}
): Promise<MergePlan[]> {
	const candidates = await loadCandidates(database);
	const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
	return findDuplicateGroups(candidates).map((ids) =>
		planMerge(
			ids.map((id) => byId.get(id)!),
			options
		)
	);
}

function affectedRows(result: unknown): number {
	const header = Array.isArray(result) ? result[0] : result;
	return (header as { affectedRows?: number } | undefined)?.affectedRows ?? 0;
}

export class SubscriberMergeSkippedError extends Error {}

/**
 * Esegue un piano in una transazione: rilegge e blocca i subscriber del gruppo, ricalcola
 * il piano sui dati attuali e rifiuta di procedere se il gruppo è cambiato o ha conflitti.
 */
export async function applySubscriberMerge(
	database: AppDatabase,
	plan: MergePlan,
	userId?: number,
	options: MergeOptions = {}
): Promise<MergeGroupResult> {
	const ids = [plan.survivor.id, ...plan.duplicates.map((d) => d.id)];

	return database.transaction(async (tx) => {
		const current = await loadCandidates(tx, ids);
		if (current.length !== ids.length || findDuplicateGroups(current)[0]?.length !== ids.length) {
			throw new SubscriberMergeSkippedError('il gruppo è cambiato dopo l’anteprima');
		}
		const fresh = planMerge(current, options);
		if (fresh.conflicts.length > 0) {
			throw new SubscriberMergeSkippedError(fresh.conflicts.join('; '));
		}

		const survivorId = fresh.survivor.id;
		const duplicateIds = fresh.duplicates.map((d) => d.id);

		// Riepiloghi settimanali: unique (subscriber_id, week_start_date), ne resta uno per settimana
		// (prima quello del superstite, poi il più vecchio).
		const summaryRows = await tx
			.select({
				id: weeklyAttendanceSummaryLog.id,
				subscriberId: weeklyAttendanceSummaryLog.subscriberId,
				weekStartDate: weeklyAttendanceSummaryLog.weekStartDate
			})
			.from(weeklyAttendanceSummaryLog)
			.where(inArray(weeklyAttendanceSummaryLog.subscriberId, ids))
			.for('update');
		summaryRows.sort(
			(a, b) =>
				Number(a.subscriberId !== survivorId) - Number(b.subscriberId !== survivorId) || a.id - b.id
		);
		const keptWeeks = new Set<string>();
		const dropSummaryIds: number[] = [];
		const moveSummaryIds: number[] = [];
		for (const row of summaryRows) {
			const week = new Date(row.weekStartDate).toISOString().slice(0, 10);
			if (keptWeeks.has(week)) dropSummaryIds.push(row.id);
			else {
				keptWeeks.add(week);
				if (row.subscriberId !== survivorId) moveSummaryIds.push(row.id);
			}
		}
		if (dropSummaryIds.length > 0) {
			await tx
				.delete(weeklyAttendanceSummaryLog)
				.where(inArray(weeklyAttendanceSummaryLog.id, dropSummaryIds));
		}
		const weeklySummaries =
			moveSummaryIds.length > 0
				? affectedRows(
						await tx
							.update(weeklyAttendanceSummaryLog)
							.set({ subscriberId: survivorId })
							.where(inArray(weeklyAttendanceSummaryLog.id, moveSummaryIds))
					)
				: 0;

		const [enrollmentResult, cardResult, attendanceResult] = await Promise.all([
			tx
				.update(enrollments)
				.set({ subscriberId: survivorId })
				.where(inArray(enrollments.subscriberId, duplicateIds)),
			tx
				.update(cardRfid)
				.set({ subscriberId: survivorId })
				.where(inArray(cardRfid.subscriberId, duplicateIds)),
			tx
				.update(attendance)
				.set({ subscriberId: survivorId })
				.where(inArray(attendance.subscriberId, duplicateIds))
		]);

		if (Object.keys(fresh.survivorUpdate).length > 0) {
			const { courseStartDate, courseEndDate, ...rest } = fresh.survivorUpdate;
			await tx
				.update(subscribers)
				.set({
					...rest,
					...('courseStartDate' in fresh.survivorUpdate
						? { courseStartDate: courseStartDate ? new Date(courseStartDate) : null }
						: {}),
					...('courseEndDate' in fresh.survivorUpdate
						? { courseEndDate: courseEndDate ? new Date(courseEndDate) : null }
						: {})
				})
				.where(eq(subscribers.id, survivorId));
		}

		await tx.delete(subscribers).where(inArray(subscribers.id, duplicateIds));

		const result: MergeGroupResult = {
			survivorId,
			mergedIds: duplicateIds,
			moved: {
				enrollments: affectedRows(enrollmentResult),
				cards: affectedRows(cardResult),
				attendance: affectedRows(attendanceResult),
				weeklySummaries
			},
			droppedWeeklySummaries: dropSummaryIds.length
		};

		// Solo identificativi e conteggi: nessun dato anagrafico nell'audit.
		await tx.insert(auditLog).values({
			userId,
			action: 'SUBSCRIBER_MERGE',
			entityType: 'subscriber',
			entityId: survivorId,
			dataBefore: { subscriberIds: ids },
			dataAfter: result,
			createdAt: new Date()
		});

		return result;
	});
}
