import { eq, and, desc, lt, sql, gte, lte } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { db } from '$lib/db';
import * as schema from '$lib/db/schema';
import {
	attendance,
	cardRfid,
	enrollments,
	staffAttendance,
	subscribers,
	users
} from '$lib/db/schema';
import type { CardRfid, Subscriber, User } from '$lib/db/schema';
import type { AttendanceEvent, QueueStatus, BatchInfo } from '$lib/utils/validation';
import { formatToRomeISO, romeDateKey } from '$lib/utils/date';
import { tryClaimPairing } from '$lib/services/nfc-pairing';
import { getSettings } from '$lib/services/settings';
import {
	determineNextStaffEventType,
	isWithinStaffMinInterval
} from '$lib/services/staff-attendance';
import { createLogger } from '$lib/server/logger';

const log = createLogger('attendance');

// Tipo per il database o transazione
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbOrTx = MySql2Database<typeof schema> | DbTransaction;

// ±30 days tolerance in milliseconds
const TOLERANCE_MS = 30 * 24 * 60 * 60 * 1000;

// Cache settings per evitare query multiple nello stesso batch
interface AttendanceSettings {
	resetEntryTypeDaily: boolean;
	minSwipeIntervalMinutes: number;
	enforceCourseDateRange: boolean;
}

export interface AttendanceAction {
	uid: string;
	action: 'confirm' | 'unknown' | 'ignored';
	user_name?: string;
	type: 'entry' | 'exit';
	ignored_reason?: string;
	rejection_reason?: AttendanceRejectionReason;
}

interface BatchResult {
	index: number;
	status: 400; // Only rejected events are included (reference v1.1: "Esito per eventi con errori")
	reason: string;
}

export type AttendanceRejectionReason =
	'unknown_card' | 'timestamp_out_of_range' | 'course_date_out_of_range';

export function getStaffCardRejectionReason(
	cardActive: boolean,
	withinTolerance: boolean
): AttendanceRejectionReason | null {
	if (!cardActive) return 'unknown_card';
	return withinTolerance ? null : 'timestamp_out_of_range';
}

/**
 * Costruisce l'azione restituita al device per una strisciata rifiutata.
 * Mantiene `action: unknown` per retrocompatibilita' e aggiunge il motivo specifico.
 */
export function createRejectedAttendanceAction(
	uid: string,
	type: 'entry' | 'exit',
	rejectionReason: AttendanceRejectionReason
): AttendanceAction {
	return {
		uid,
		action: 'unknown',
		type,
		rejection_reason: rejectionReason
	};
}

export interface SingleAttendanceResult {
	accepted: number;
	rejected: number;
	server_time: string;
	actions: AttendanceAction[];
}

export interface BatchAttendanceResult {
	accepted: number;
	rejected: number;
	server_time: string;
	results: BatchResult[];
	actions: AttendanceAction[];
}

/**
 * Carica i settings di configurazione per le presenze dal service `settings`
 * (tipizzato e con cache TTL, invalidata a ogni salvataggio).
 */
async function loadAttendanceSettings(): Promise<AttendanceSettings> {
	const appSettings = await getSettings();
	return {
		resetEntryTypeDaily: appSettings.reset_entry_type_daily,
		minSwipeIntervalMinutes: appSettings.min_swipe_interval_minutes,
		enforceCourseDateRange: appSettings.enforce_course_date_range
	};
}

/**
 * Verifica se l'ultima strisciata è avvenuta entro l'intervallo minimo.
 * Restituisce true se l'evento deve essere ignorato (troppo vicino al precedente).
 */
async function isWithinMinInterval(
	cardUid: string,
	currentTimestamp: string,
	minIntervalMinutes: number,
	tx?: DbOrTx
): Promise<boolean> {
	if (minIntervalMinutes <= 0) return false;

	const dbInstance = tx ?? db;

	// Calcola il timestamp minimo (current - interval)
	const currentDate = new Date(currentTimestamp);
	const minDate = new Date(currentDate.getTime() - minIntervalMinutes * 60 * 1000);

	// Cerca se c'è un evento recente per questa card
	const [recentEvent] = await dbInstance
		.select({ id: attendance.id })
		.from(attendance)
		.where(and(eq(attendance.cardUid, cardUid), gte(attendance.readTimestamp, minDate)))
		.limit(1);

	return !!recentEvent;
}

function getCourseDateKey(timestamp: string): string {
	return romeDateKey(timestamp);
}

/** True se i due istanti cadono nello stesso giorno di calendario Europe/Rome. */
export function isSameRomeDay(a: Date | string, b: Date | string): boolean {
	return romeDateKey(a) === romeDateKey(b);
}

async function isWithinSubscriberCourseRange(
	subscriberId: number | null | undefined,
	timestamp: string,
	tx?: DbOrTx
): Promise<boolean> {
	if (!subscriberId) return false;

	const dbInstance = tx ?? db;
	const courseDate = new Date(`${getCourseDateKey(timestamp)}T00:00:00.000Z`);

	const [matchingEnrollment] = await dbInstance
		.select({ id: enrollments.id })
		.from(enrollments)
		.where(
			and(
				eq(enrollments.subscriberId, subscriberId),
				lte(enrollments.startDate, courseDate),
				gte(enrollments.endDate, courseDate)
			)
		)
		.limit(1);

	return !!matchingEnrollment;
}

export async function getAttendanceRejectionReason(
	params: {
		cardActive: boolean;
		subscriberId: number | null | undefined;
		withinTolerance: boolean;
		timestamp: string;
		enforceCourseDateRange: boolean;
		tx?: DbOrTx;
	},
	courseRangeLookup?: () => Promise<boolean>
): Promise<AttendanceRejectionReason | null> {
	if (!params.cardActive) return 'unknown_card';
	if (!params.withinTolerance) return 'timestamp_out_of_range';
	if (!params.enforceCourseDateRange) return null;

	const withinCourseRange = courseRangeLookup
		? await courseRangeLookup()
		: await isWithinSubscriberCourseRange(params.subscriberId, params.timestamp, params.tx);

	return withinCourseRange ? null : 'course_date_out_of_range';
}

/**
 * Determina il tipo di evento (entry/exit) basandosi sull'ultimo evento salvato.
 * Logica:
 * - Se resetEntryTypeDaily = true:
 *   - Se non c'è storia → 'entry'
 *   - Se l'ultimo evento era 'exit' → 'entry'
 *   - Se l'ultimo evento era 'entry' dello stesso giorno → 'exit'
 *   - Se l'ultimo evento era 'entry' di un giorno precedente → 'entry' (nuova giornata)
 * - Se resetEntryTypeDaily = false:
 *   - Alterna sempre tra entry e exit indipendentemente dal giorno
 */
async function determineNextEventType(
	cardUid: string,
	currentTimestamp: string,
	resetEntryTypeDaily: boolean,
	tx?: DbOrTx
): Promise<'entry' | 'exit'> {
	const dbInstance = tx ?? db;

	// Converte il timestamp per il confronto SQL
	const dbTimestamp = new Date(currentTimestamp);

	// Cerca l'ultimo evento per questa card (prima del timestamp corrente)
	const [lastEvent] = await dbInstance
		.select({
			eventType: attendance.eventType,
			readTimestamp: attendance.readTimestamp
		})
		.from(attendance)
		.where(and(eq(attendance.cardUid, cardUid), lt(attendance.readTimestamp, sql`${dbTimestamp}`)))
		.orderBy(desc(attendance.readTimestamp))
		.limit(1);

	// Se non c'è storia, è un entry
	if (!lastEvent) {
		return 'entry';
	}

	// Se l'ultimo evento era exit, il prossimo è entry
	if (lastEvent.eventType === 'exit') {
		return 'entry';
	}

	// Se resetEntryTypeDaily è false, alterna sempre (entry -> exit)
	if (!resetEntryTypeDaily) {
		return 'exit';
	}

	// Se l'ultimo evento era entry dello stesso giorno (Europe/Rome) è un exit,
	// altrimenti è un entry (nuova giornata)
	return isSameRomeDay(lastEvent.readTimestamp, currentTimestamp) ? 'exit' : 'entry';
}

type AttendanceEventType = 'entry' | 'exit';

/** Riga card con iscritto/utente collegati, come letta per ogni strisciata. */
export interface AttendanceCardRow {
	card: CardRfid;
	subscriber: Subscriber | null;
	user: User | null;
}

/** Classificazione della card usata da tutte le regole di validazione. */
export interface AttendanceCardInfo {
	isStaffCard: boolean;
	cardActive: boolean;
}

export function classifyAttendanceCard(cardRow: AttendanceCardRow | undefined): AttendanceCardInfo {
	const isStaffCard = Boolean(cardRow?.card?.userId && !cardRow.card.subscriberId && cardRow.user);
	const cardActive =
		cardRow?.card?.status === 'active' && (!isStaffCard || cardRow?.user?.status === 'active');
	return { isStaffCard, cardActive };
}

/** Timestamp effettivo dell'evento: `device_time_raw` se presente, altrimenti `timestamp`. */
export function getEventTimestamp(event: Pick<AttendanceEvent, 'timestamp' | 'device_time_raw'>) {
	return event.device_time_raw || event.timestamp;
}

function subscriberDisplayName(subscriber: Subscriber): string {
	return `${subscriber.firstName} ${subscriber.lastName}`.trim();
}

/** Azione restituita al device per una strisciata ignorata per intervallo minimo. */
export function createIgnoredAttendanceAction(
	uid: string,
	type: AttendanceEventType,
	cardRow: AttendanceCardRow | undefined,
	isStaffCard: boolean,
	minSwipeIntervalMinutes: number
): AttendanceAction {
	return {
		uid,
		action: 'ignored',
		user_name: isStaffCard
			? cardRow?.user?.name
			: cardRow?.subscriber
				? subscriberDisplayName(cardRow.subscriber)
				: undefined,
		type,
		ignored_reason: `min_interval_${minSwipeIntervalMinutes}min`
	};
}

/** Azione restituita al device per una strisciata registrata. */
export function createAcceptedAttendanceAction(
	uid: string,
	type: AttendanceEventType,
	cardRow: AttendanceCardRow | undefined,
	card: AttendanceCardInfo
): AttendanceAction {
	if (card.cardActive && card.isStaffCard && cardRow?.user) {
		return { uid, action: 'confirm', user_name: cardRow.user.name, type };
	}
	if (card.cardActive && cardRow?.subscriber) {
		return {
			uid,
			action: 'confirm',
			user_name: subscriberDisplayName(cardRow.subscriber),
			type
		};
	}
	return { uid, action: 'unknown', type };
}

/**
 * Tipo del prossimo evento a partire dall'evento precedente (stessa regola di
 * `determineNextEventType`, ma senza query).
 */
export function determineNextEventTypeFromPrevious(
	previous: { eventType: AttendanceEventType; readTimestamp: Date | string } | null,
	currentTimestamp: Date | string,
	resetEntryTypeDaily: boolean
): AttendanceEventType {
	if (!previous || previous.eventType === 'exit') return 'entry';
	if (!resetEntryTypeDaily) return 'exit';
	return isSameRomeDay(previous.readTimestamp, currentTimestamp) ? 'exit' : 'entry';
}

/** True se la strisciata e' entro l'intervallo minimo dalla precedente nello stesso batch. */
export function isWithinBatchSwipeInterval(
	lastBatchTime: number | undefined,
	eventTime: number,
	minIntervalMs: number
): boolean {
	return (
		lastBatchTime !== undefined &&
		eventTime >= lastBatchTime &&
		eventTime - lastBatchTime < minIntervalMs
	);
}

/**
 * Stato condiviso tra gli eventi di un batch offline.
 * - `virtualEvents`: eventi (anche rifiutati) gia' elaborati nel batch, per chiave identita',
 *   usati per decidere entry/exit senza dipendere dall'ordine dei timestamp in DB.
 * - `swipeTimes`: ultimo istante di strisciata nel batch, per il controllo dell'intervallo minimo.
 */
export interface BatchAttendanceState {
	virtualEvents: Map<string, { eventType: AttendanceEventType; readTimestamp: string }[]>;
	swipeTimes: Map<string, number>;
}

export function createBatchAttendanceState(): BatchAttendanceState {
	return { virtualEvents: new Map(), swipeTimes: new Map() };
}

export interface AttendanceProcessingContext {
	deviceId: string;
	/** Istante di riferimento (ms) per la tolleranza sui timestamp. */
	now: number;
	settings: AttendanceSettings;
	/** `true` per gli eventi arrivati dalla coda offline (batch). */
	offlineQueued: boolean;
	queueStatus?: QueueStatus;
	/** Consente l'abbinamento NFC di card sconosciute (solo percorso online). */
	allowNfcPairing: boolean;
	/** Presente solo nel percorso batch. */
	batch?: BatchAttendanceState;
}

export type AttendanceEventOutcome =
	| { status: 'accepted'; action: AttendanceAction }
	| { status: 'ignored'; action: AttendanceAction }
	| { status: 'rejected'; reason: AttendanceRejectionReason; action: AttendanceAction };

async function findAttendanceCardRow(
	uid: string,
	tx: DbOrTx
): Promise<AttendanceCardRow | undefined> {
	const [cardRow] = await tx
		.select({ card: cardRfid, subscriber: subscribers, user: users })
		.from(cardRfid)
		.leftJoin(subscribers, eq(cardRfid.subscriberId, subscribers.id))
		.leftJoin(users, eq(cardRfid.userId, users.id))
		.where(eq(cardRfid.uid, uid))
		.limit(1);
	return cardRow;
}

/**
 * NFC pairing: se la card e' sconosciuta e c'e' una sessione di abbinamento attiva,
 * crea la card per l'iscritto in attesa e la rilegge.
 */
async function tryPairUnknownCard(
	uid: string,
	deviceId: string,
	tx: DbOrTx
): Promise<AttendanceCardRow | undefined> {
	const pairedSubscriberId = tryClaimPairing(uid);
	if (pairedSubscriberId === null) return undefined;

	try {
		await tx.insert(cardRfid).values({
			uid,
			subscriberId: pairedSubscriberId,
			status: 'active',
			writeDate: new Date(),
			writtenByDevice: deviceId
		});
		return await findAttendanceCardRow(uid, tx);
	} catch (err) {
		log.error('NFC pairing insert failed', { err });
		return undefined;
	}
}

/**
 * Elabora una singola strisciata: ricerca card (ed eventuale abbinamento NFC), validazione,
 * intervallo minimo, calcolo entry/exit e inserimento. Usata sia dal percorso singolo sia dal
 * batch; le differenze sono espresse da `ctx` (`offlineQueued`, `allowNfcPairing`, `batch`).
 */
export async function processAttendanceEvent(
	event: AttendanceEvent,
	ctx: AttendanceProcessingContext,
	tx: DbOrTx
): Promise<AttendanceEventOutcome> {
	const { settings: attendanceSettings } = ctx;
	const timestampToUse = getEventTimestamp(event);
	const eventTime = new Date(timestampToUse).getTime();
	const withinTolerance = Math.abs(eventTime - ctx.now) <= TOLERANCE_MS;

	let cardRow = await findAttendanceCardRow(event.uid, tx);
	if (!cardRow && ctx.allowNfcPairing) {
		cardRow = await tryPairUnknownCard(event.uid, ctx.deviceId, tx);
	}

	const cardInfo = classifyAttendanceCard(cardRow);
	const { isStaffCard, cardActive } = cardInfo;
	const staffUserId = isStaffCard ? cardRow!.user!.id : null;
	const rejectionReason = isStaffCard
		? getStaffCardRejectionReason(cardActive, withinTolerance)
		: await getAttendanceRejectionReason({
				cardActive,
				subscriberId: cardRow?.card?.subscriberId,
				withinTolerance,
				timestamp: timestampToUse,
				enforceCourseDateRange: attendanceSettings.enforceCourseDateRange,
				tx
			});
	const validated = rejectionReason === null;
	const identityKey = staffUserId !== null ? `user:${staffUserId}` : `card:${event.uid}`;

	// Verifica intervallo minimo tra strisciate (nel batch anche rispetto agli eventi precedenti)
	const minIntervalMs = attendanceSettings.minSwipeIntervalMinutes * 60_000;
	let withinInterval = false;
	if (validated && minIntervalMs > 0) {
		if (ctx.batch) {
			withinInterval = isWithinBatchSwipeInterval(
				ctx.batch.swipeTimes.get(identityKey),
				eventTime,
				minIntervalMs
			);
		}
		if (!withinInterval) {
			withinInterval =
				staffUserId !== null
					? await isWithinStaffMinInterval(
							staffUserId,
							timestampToUse,
							attendanceSettings.minSwipeIntervalMinutes,
							tx
						)
					: await isWithinMinInterval(
							event.uid,
							timestampToUse,
							attendanceSettings.minSwipeIntervalMinutes,
							tx
						);
		}
		ctx.batch?.swipeTimes.set(identityKey, eventTime);
	}

	// Determina il tipo di evento (entry/exit): prima dagli eventi del batch, poi dal DB
	const previousInBatch = ctx.batch?.virtualEvents.get(identityKey)?.at(-1) ?? null;
	const nextEventType: AttendanceEventType = previousInBatch
		? determineNextEventTypeFromPrevious(
				previousInBatch,
				timestampToUse,
				attendanceSettings.resetEntryTypeDaily
			)
		: staffUserId !== null
			? await determineNextStaffEventType(
					staffUserId,
					timestampToUse,
					attendanceSettings.resetEntryTypeDaily,
					tx
				)
			: await determineNextEventType(
					event.uid,
					timestampToUse,
					attendanceSettings.resetEntryTypeDaily,
					tx
				);

	if (withinInterval) {
		// Strisciata troppo vicina alla precedente — non registrare, segnala al device
		return {
			status: 'ignored',
			action: createIgnoredAttendanceAction(
				event.uid,
				nextEventType,
				cardRow,
				isStaffCard,
				attendanceSettings.minSwipeIntervalMinutes
			)
		};
	}

	if (ctx.batch) {
		const identityEvents = ctx.batch.virtualEvents.get(identityKey) ?? [];
		identityEvents.push({ eventType: nextEventType, readTimestamp: timestampToUse });
		ctx.batch.virtualEvents.set(identityKey, identityEvents);
	}

	if (!validated) {
		return {
			status: 'rejected',
			reason: rejectionReason,
			action: createRejectedAttendanceAction(event.uid, nextEventType, rejectionReason)
		};
	}

	const common = {
		cardUid: event.uid,
		uidRaw: event.uid_raw ?? null,
		deviceId: ctx.deviceId,
		eventType: nextEventType,
		readTimestamp: new Date(timestampToUse),
		deviceTimeRaw: event.device_time_raw ? new Date(event.device_time_raw) : null,
		offlineQueued: ctx.offlineQueued,
		rawPayload: event as unknown as Record<string, unknown>,
		validated: true,
		queuePending: ctx.queueStatus?.pending ?? null,
		storageFreePercent: ctx.queueStatus?.storage_free_percent ?? null
	};

	if (staffUserId !== null) {
		await tx.insert(staffAttendance).values({
			...common,
			userId: staffUserId,
			source: 'card',
			isBackdated: false
		});
	} else {
		await tx.insert(attendance).values({
			...common,
			subscriberId: cardRow?.card?.subscriberId ?? null
		});
	}

	return {
		status: 'accepted',
		action: createAcceptedAttendanceAction(event.uid, nextEventType, cardRow, cardInfo)
	};
}

export async function processSingleAttendance(
	events: AttendanceEvent[],
	deviceId: string,
	queueStatus?: QueueStatus
): Promise<SingleAttendanceResult> {
	const actions: AttendanceAction[] = [];
	const now = Date.now();
	let accepted = 0;
	let rejected = 0;

	// Settings letti una sola volta (dalla cache del service) prima di aprire la transazione
	const attendanceSettings = await loadAttendanceSettings();

	await db.transaction(async (tx) => {
		const ctx: AttendanceProcessingContext = {
			deviceId,
			now,
			settings: attendanceSettings,
			offlineQueued: false,
			queueStatus,
			allowNfcPairing: true
		};

		for (const event of events) {
			const outcome = await processAttendanceEvent(event, ctx, tx);
			if (outcome.status === 'accepted') accepted++;
			else if (outcome.status === 'rejected') rejected++;
			actions.push(outcome.action);
		}
	});

	return {
		accepted,
		rejected,
		server_time: formatToRomeISO(),
		actions
	};
}

export async function processBatchAttendance(
	events: AttendanceEvent[],
	deviceId: string,
	batchInfo: BatchInfo,
	queueStatus: QueueStatus
): Promise<BatchAttendanceResult> {
	const results: BatchResult[] = [];
	const actions: AttendanceAction[] = [];
	const now = Date.now();
	let accepted = 0;
	let rejected = 0;

	// Settings letti una sola volta (dalla cache del service) prima di aprire la transazione
	const attendanceSettings = await loadAttendanceSettings();

	await db.transaction(async (tx) => {
		const ctx: AttendanceProcessingContext = {
			deviceId,
			now,
			settings: attendanceSettings,
			offlineQueued: true,
			queueStatus,
			allowNfcPairing: false,
			batch: createBatchAttendanceState()
		};

		for (let i = 0; i < events.length; i++) {
			const outcome = await processAttendanceEvent(events[i], ctx, tx);
			if (outcome.status === 'accepted') {
				accepted++;
			} else if (outcome.status === 'rejected') {
				rejected++;
				results.push({ index: i, status: 400, reason: outcome.reason });
			}
			actions.push(outcome.action);
		}
	});

	return {
		accepted,
		rejected,
		server_time: formatToRomeISO(),
		results,
		actions
	};
}
