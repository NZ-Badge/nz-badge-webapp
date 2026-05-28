import { eq, and, desc, lt, sql, gte, lte } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { db } from '$lib/db';
import * as schema from '$lib/db/schema';
import { attendance, cardRfid, enrollments, subscribers, settings } from '$lib/db/schema';
import type { AttendanceEvent, QueueStatus, BatchInfo } from '$lib/utils/validation';
import { formatToRomeISO, TIMEZONE, toDatabaseDateTime } from '$lib/utils/date';
import { tryClaimPairing } from '$lib/services/nfc-pairing';
import { formatInTimeZone } from 'date-fns-tz';

// Tipo per il database o transazione
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbOrTx = MySql2Database<typeof schema> | DbTransaction;

// ±30 days tolerance in milliseconds
const TOLERANCE_MS = 30 * 24 * 60 * 60 * 1000;

// Cache settings per evitare query multiple nello stesso batch
interface AttendanceSettings {
	resetEntryTypeDaily: boolean;
	minSwipeIntervalMinutes: number;
}

interface AttendanceAction {
	uid: string;
	action: 'confirm' | 'unknown' | 'ignored';
	user_name?: string;
	type: 'entry' | 'exit';
	ignored_reason?: string;
}

interface BatchResult {
	index: number;
	status: 400; // Only rejected events are included (reference v1.1: "Esito per eventi con errori")
	reason: string;
}

type AttendanceRejectionReason =
	| 'unknown_card'
	| 'timestamp_out_of_range'
	| 'course_date_out_of_range';

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
 * Carica i settings di configurazione per le presenze
 */
async function loadAttendanceSettings(tx?: DbOrTx): Promise<AttendanceSettings> {
	const dbInstance = tx ?? db;

	const allSettings = await dbInstance.select().from(settings);

	let resetEntryTypeDaily = true; // default
	let minSwipeIntervalMinutes = 15; // default

	for (const setting of allSettings) {
		if (setting.key === 'reset_entry_type_daily') {
			resetEntryTypeDaily = setting.value === 'true';
		} else if (setting.key === 'min_swipe_interval_minutes') {
			minSwipeIntervalMinutes = parseInt(setting.value, 10) || 15;
		}
	}

	return {
		resetEntryTypeDaily,
		minSwipeIntervalMinutes
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
		.where(
			and(
				eq(attendance.cardUid, cardUid),
				gte(attendance.readTimestamp, toDatabaseDateTime(minDate.toISOString()))
			)
		)
		.limit(1);

	return !!recentEvent;
}

function getCourseDateKey(timestamp: string): string {
	return formatInTimeZone(new Date(timestamp), TIMEZONE, 'yyyy-MM-dd');
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

async function getAttendanceRejectionReason(params: {
	cardActive: boolean;
	subscriberId: number | null | undefined;
	withinTolerance: boolean;
	timestamp: string;
	tx?: DbOrTx;
}): Promise<AttendanceRejectionReason | null> {
	if (!params.cardActive) return 'unknown_card';
	if (!params.withinTolerance) return 'timestamp_out_of_range';

	const withinCourseRange = await isWithinSubscriberCourseRange(
		params.subscriberId,
		params.timestamp,
		params.tx
	);

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

	// Ottieni la data del timestamp corrente (normalizzata a mezzanotte)
	const currentDate = new Date(currentTimestamp);
	const currentDay = new Date(
		currentDate.getFullYear(),
		currentDate.getMonth(),
		currentDate.getDate()
	);

	// Converte il timestamp per il confronto SQL
	const dbTimestamp = toDatabaseDateTime(currentTimestamp);

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

	// Se l'ultimo evento era entry, controlla se è dello stesso giorno
	const lastEventDate = new Date(lastEvent.readTimestamp);
	const lastEventDay = new Date(
		lastEventDate.getFullYear(),
		lastEventDate.getMonth(),
		lastEventDate.getDate()
	);

	// Se è dello stesso giorno, è un exit; altrimenti è un entry (nuova giornata)
	return lastEventDay.getTime() === currentDay.getTime() ? 'exit' : 'entry';
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

	// Carica i settings una sola volta
	const attendanceSettings = await loadAttendanceSettings();

	for (const event of events) {
		// Usa device_time_raw come fallback per il timestamp se presente
		const timestampToUse = event.device_time_raw || event.timestamp;
		const eventTime = new Date(timestampToUse).getTime();
		const withinTolerance = Math.abs(eventTime - now) <= TOLERANCE_MS;

		// Look up card
		let [cardRow] = await db
			.select({ card: cardRfid, subscriber: subscribers })
			.from(cardRfid)
			.leftJoin(subscribers, eq(cardRfid.subscriberId, subscribers.id))
			.where(eq(cardRfid.uid, event.uid))
			.limit(1);

		// NFC pairing: if card is unknown, check if there's an active pairing session
		if (!cardRow) {
			const pairedSubscriberId = tryClaimPairing(event.uid);
			if (pairedSubscriberId !== null) {
				try {
					await db.insert(cardRfid).values({
						uid: event.uid,
						subscriberId: pairedSubscriberId,
						status: 'active',
						writeDate: new Date(),
						writtenByDevice: deviceId
					});
					[cardRow] = await db
						.select({ card: cardRfid, subscriber: subscribers })
						.from(cardRfid)
						.leftJoin(subscribers, eq(cardRfid.subscriberId, subscribers.id))
						.where(eq(cardRfid.uid, event.uid))
						.limit(1);
				} catch (err) {
					console.error('[attendance] NFC pairing insert failed:', err);
				}
			}
		}

		const cardActive = cardRow?.card?.status === 'active';
		const rejectionReason = await getAttendanceRejectionReason({
			cardActive,
			subscriberId: cardRow?.card?.subscriberId,
			withinTolerance,
			timestamp: timestampToUse
		});
		const validated = rejectionReason === null;

		// Verifica intervallo minimo tra strisciate
		const withinInterval = validated
			? await isWithinMinInterval(
					event.uid,
					timestampToUse,
					attendanceSettings.minSwipeIntervalMinutes
				)
			: false;

		if (withinInterval) {
			// Strisciata troppo vicina alla precedente — non registrare, segnala al device
			const nextEventType = await determineNextEventType(
				event.uid,
				timestampToUse,
				attendanceSettings.resetEntryTypeDaily
			);
			actions.push({
				uid: event.uid,
				action: 'ignored',
				user_name: cardRow?.subscriber
					? `${cardRow.subscriber.firstName} ${cardRow.subscriber.lastName}`.trim()
					: undefined,
				type: nextEventType,
				ignored_reason: `min_interval_${attendanceSettings.minSwipeIntervalMinutes}min`
			});
			continue;
		}

		// Determina il tipo di evento (entry/exit) basandosi sull'ultimo evento salvato
		const nextEventType = await determineNextEventType(
			event.uid,
			timestampToUse,
			attendanceSettings.resetEntryTypeDaily
		);

		if (validated) {
			accepted++;
			await db.insert(attendance).values({
				cardUid: event.uid,
				uidRaw: event.uid_raw ?? null,
				subscriberId: cardRow?.card?.subscriberId ?? null,
				deviceId,
				eventType: nextEventType,
				readTimestamp: toDatabaseDateTime(timestampToUse),
				deviceTimeRaw: event.device_time_raw ? toDatabaseDateTime(event.device_time_raw) : null,
				offlineQueued: false,
				rawPayload: event as unknown as Record<string, unknown>,
				validated: true,
				queuePending: queueStatus?.pending ?? null,
				storageFreePercent: queueStatus?.storage_free_percent ?? null
			});
			if (cardActive && cardRow.subscriber) {
				actions.push({
					uid: event.uid,
					action: 'confirm',
					user_name: `${cardRow.subscriber.firstName} ${cardRow.subscriber.lastName}`.trim(),
					type: nextEventType
				});
			} else {
				actions.push({ uid: event.uid, action: 'unknown', type: nextEventType });
			}
		} else {
			rejected++;
			actions.push({ uid: event.uid, action: 'unknown', type: nextEventType });
		}
	}

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

	// Mappa per tracciare gli eventi "virtuali" creati durante il batch
	// Chiave: cardUid, Valore: { eventType, readTimestamp }
	const virtualEvents = new Map<string, { eventType: 'entry' | 'exit'; readTimestamp: string }[]>();

	// Mappa per tracciare le strisciate nel batch (per controllo intervallo)
	const batchSwipeTimes = new Map<string, number>();

	await db.transaction(async (tx) => {
		// Carica i settings una sola volta per la transazione
		const attendanceSettings = await loadAttendanceSettings(tx);

		for (let i = 0; i < events.length; i++) {
			const event = events[i];
			// Usa device_time_raw come fallback per il timestamp se presente
			const timestampToUse = event.device_time_raw || event.timestamp;
			const eventTime = new Date(timestampToUse).getTime();
			const withinTolerance = Math.abs(eventTime - now) <= TOLERANCE_MS;

			const [cardRow] = await tx
				.select({ card: cardRfid, subscriber: subscribers })
				.from(cardRfid)
				.leftJoin(subscribers, eq(cardRfid.subscriberId, subscribers.id))
				.where(eq(cardRfid.uid, event.uid))
				.limit(1);

			const cardActive = cardRow?.card?.status === 'active';
			const rejectionReason = await getAttendanceRejectionReason({
				cardActive,
				subscriberId: cardRow?.card?.subscriberId,
				withinTolerance,
				timestamp: timestampToUse,
				tx
			});
			const validated = rejectionReason === null;

			// Verifica intervallo minimo (controlla sia nel batch che nel DB)
			const minIntervalMs = attendanceSettings.minSwipeIntervalMinutes * 60 * 1000;
			let withinInterval = false;

			if (validated && minIntervalMs > 0) {
				// Controlla se c'è una strisciata recente nello stesso batch
				const lastBatchTime = batchSwipeTimes.get(event.uid);
				if (lastBatchTime && eventTime - lastBatchTime < minIntervalMs) {
					withinInterval = true;
				}

				// Se non trovato nel batch, controlla nel DB
				if (!withinInterval) {
					withinInterval = await isWithinMinInterval(
						event.uid,
						timestampToUse,
						attendanceSettings.minSwipeIntervalMinutes,
						tx
					);
				}

				// Aggiorna il timestamp dell'ultima strisciata nel batch
				batchSwipeTimes.set(event.uid, eventTime);
			}

			if (withinInterval) {
				// Strisciata troppo vicina - determina il tipo per coerenza
				const currentDate = new Date(timestampToUse);
				const currentDay = new Date(
					currentDate.getFullYear(),
					currentDate.getMonth(),
					currentDate.getDate()
				);

				const cardVirtualEvents = virtualEvents.get(event.uid) ?? [];
				const lastVirtualEvent =
					cardVirtualEvents.length > 0 ? cardVirtualEvents[cardVirtualEvents.length - 1] : null;

				let nextEventType: 'entry' | 'exit';
				if (lastVirtualEvent) {
					if (lastVirtualEvent.eventType === 'exit') {
						nextEventType = 'entry';
					} else {
						const lastEventDate = new Date(lastVirtualEvent.readTimestamp);
						const lastEventDay = new Date(
							lastEventDate.getFullYear(),
							lastEventDate.getMonth(),
							lastEventDate.getDate()
						);
						nextEventType = lastEventDay.getTime() === currentDay.getTime() ? 'exit' : 'entry';
					}
				} else {
					nextEventType = await determineNextEventType(
						event.uid,
						timestampToUse,
						attendanceSettings.resetEntryTypeDaily,
						tx
					);
				}

				// Strisciata troppo vicina — non registrare, segnala al device
				actions.push({
					uid: event.uid,
					action: 'ignored',
					user_name: cardRow?.subscriber
						? `${cardRow.subscriber.firstName} ${cardRow.subscriber.lastName}`.trim()
						: undefined,
					type: nextEventType,
					ignored_reason: `min_interval_${attendanceSettings.minSwipeIntervalMinutes}min`
				});
				continue;
			}

			// Determina il tipo di evento (entry/exit)
			// Per il batch, consideriamo anche gli eventi precedenti nello stesso batch
			let nextEventType: 'entry' | 'exit';

			const currentDate = new Date(timestampToUse);
			const currentDay = new Date(
				currentDate.getFullYear(),
				currentDate.getMonth(),
				currentDate.getDate()
			);

			// Cerca nell'ultimo evento virtuale creato nello stesso batch per questa card
			const cardVirtualEvents = virtualEvents.get(event.uid) ?? [];
			const lastVirtualEvent =
				cardVirtualEvents.length > 0 ? cardVirtualEvents[cardVirtualEvents.length - 1] : null;

			if (lastVirtualEvent) {
				// C'è un evento precedente nello stesso batch
				if (lastVirtualEvent.eventType === 'exit') {
					nextEventType = 'entry';
				} else {
					// Controlla se è dello stesso giorno
					const lastEventDate = new Date(lastVirtualEvent.readTimestamp);
					const lastEventDay = new Date(
						lastEventDate.getFullYear(),
						lastEventDate.getMonth(),
						lastEventDate.getDate()
					);

					// Se resetEntryTypeDaily è false, alterna sempre
					if (!attendanceSettings.resetEntryTypeDaily) {
						nextEventType = 'exit';
					} else {
						nextEventType = lastEventDay.getTime() === currentDay.getTime() ? 'exit' : 'entry';
					}
				}
			} else {
				// Non ci sono eventi precedenti nello stesso batch, controlla nel DB
				nextEventType = await determineNextEventType(
					event.uid,
					timestampToUse,
					attendanceSettings.resetEntryTypeDaily,
					tx
				);
			}

			// Salva l'evento virtuale per eventuali eventi successivi nello stesso batch
			if (!virtualEvents.has(event.uid)) {
				virtualEvents.set(event.uid, []);
			}
			virtualEvents.get(event.uid)!.push({
				eventType: nextEventType,
				readTimestamp: timestampToUse
			});

			if (validated) {
				accepted++;
				await tx.insert(attendance).values({
					cardUid: event.uid,
					uidRaw: event.uid_raw ?? null,
					subscriberId: cardRow?.card?.subscriberId ?? null,
					deviceId,
					eventType: nextEventType,
					readTimestamp: toDatabaseDateTime(timestampToUse),
					deviceTimeRaw: event.device_time_raw ? toDatabaseDateTime(event.device_time_raw) : null,
					offlineQueued: true,
					rawPayload: event as unknown as Record<string, unknown>,
					validated: true,
					queuePending: queueStatus.pending,
					storageFreePercent: queueStatus.storage_free_percent
				});
				if (cardActive && cardRow.subscriber) {
					actions.push({
						uid: event.uid,
						action: 'confirm',
						user_name: `${cardRow.subscriber.firstName} ${cardRow.subscriber.lastName}`.trim(),
						type: nextEventType
					});
				} else {
					actions.push({ uid: event.uid, action: 'unknown', type: nextEventType });
				}
			} else {
				rejected++;
				results.push({
					index: i,
					status: 400,
					reason: rejectionReason ?? 'unknown_card'
				});
				actions.push({ uid: event.uid, action: 'unknown', type: nextEventType });
			}
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
