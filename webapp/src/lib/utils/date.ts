import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { z } from 'zod';

export const TIMEZONE = 'Europe/Rome';

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Chiave del giorno (yyyy-MM-dd) nel fuso Europe/Rome, indipendente dal fuso del server. */
export function romeDateKey(value: Date | string | number): string {
	return formatInTimeZone(new Date(value), TIMEZONE, 'yyyy-MM-dd');
}

/** Verifica che la stringa sia una data yyyy-MM-dd esistente. */
export function isDateKey(value: string): boolean {
	if (!DATE_KEY_PATTERN.test(value)) return false;
	const date = new Date(`${value}T00:00:00.000Z`);
	return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Schema Zod per una data yyyy-MM-dd esistente. */
export const dateKeySchema = /* @__PURE__ */ z
	.string()
	.refine(isDateKey, { message: 'Data non valida' });

/** Aggiunge (o sottrae) giorni di calendario a una chiave yyyy-MM-dd. */
export function addDaysToDateKey(dateKey: string, days: number): string {
	const date = new Date(`${dateKey}T00:00:00.000Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

/** Istante di inizio (00:00 Europe/Rome) del giorno indicato. */
export function romeDayStart(dateKey: string): Date {
	return fromZonedTime(`${dateKey}T00:00:00.000`, TIMEZONE);
}

/**
 * Intervallo semiaperto [start, end) che copre i giorni da `fromKey` a `toKey` inclusi,
 * con i confini a mezzanotte Europe/Rome.
 */
export function romeDayRange(fromKey: string, toKey: string = fromKey): { start: Date; end: Date } {
	return { start: romeDayStart(fromKey), end: romeDayStart(addDaysToDateKey(toKey, 1)) };
}

/**
 * Formatta una data in formato ISO con timezone Europe/Rome
 * Usato principalmente per server_time nelle risposte API
 */
export function formatToRomeISO(date: Date = new Date()): string {
	return formatInTimeZone(date, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss.SSSxxx");
}

/**
 * @deprecated No-op: i Date vanno passati al database cosi' come sono (UTC).
 * Resta solo finche' `services/attendance.ts` non viene aggiornato; non usarla nel nuovo codice.
 */
export function toDatabaseDateTime(date: Date | string | number): Date {
	return date instanceof Date ? date : new Date(date as string | number);
}

export type DisplayDateValue = Date | string | number | null | undefined;

function toValidDate(value: Exclude<DisplayDateValue, null | undefined>): Date | null {
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	// Date normalizza ad esempio il 30 febbraio a marzo: non mostrarlo come data valida.
	if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
		if (date.toISOString().slice(0, 10) !== value) return null;
	}
	return date;
}

/** Valore ISO dei campi solo data, indipendente dal fuso del browser. */
export function toRomeDateInputValue(value: DisplayDateValue): string {
	if (value === null || value === undefined || value === '') return '';
	const date = toValidDate(value);
	return date ? formatInTimeZone(date, TIMEZONE, 'yyyy-MM-dd') : '';
}

/**
 * Formatta una data per la visualizzazione: sempre gg/mm/aaaa in timezone Europe/Rome.
 * Restituisce '' per valori nullish o non validi.
 */
export function formatDateIT(value: DisplayDateValue): string {
	if (value === null || value === undefined || value === '') return '';
	const date = toValidDate(value);
	return date ? formatInTimeZone(date, TIMEZONE, 'dd/MM/yyyy') : '';
}

/**
 * Formatta un orario per la visualizzazione: sempre HH:mm (24h) in timezone Europe/Rome,
 * oppure HH:mm:ss con { seconds: true }. Restituisce '' per valori nullish o non validi.
 */
export function formatTimeIT(value: DisplayDateValue, opts: { seconds?: boolean } = {}): string {
	if (value === null || value === undefined || value === '') return '';
	const date = toValidDate(value);
	return date ? formatInTimeZone(date, TIMEZONE, opts.seconds ? 'HH:mm:ss' : 'HH:mm') : '';
}

/**
 * Formatta data e ora per la visualizzazione: sempre gg/mm/aaaa HH:mm (24h) in timezone
 * Europe/Rome, oppure con i secondi con { seconds: true }.
 * Restituisce '' per valori nullish o non validi.
 */
export function formatDateTimeIT(
	value: DisplayDateValue,
	opts: { seconds?: boolean } = {}
): string {
	if (value === null || value === undefined || value === '') return '';
	const date = toValidDate(value);
	return date
		? formatInTimeZone(date, TIMEZONE, opts.seconds ? 'dd/MM/yyyy HH:mm:ss' : 'dd/MM/yyyy HH:mm')
		: '';
}

/**
 * Valore per i campi data+ora dei form: yyyy-MM-ddTHH:mm in timezone Europe/Rome.
 * E' il formato atteso dalle API esistenti (non e' un formato di visualizzazione).
 */
export function toRomeDateTimeInputValue(date: Date = new Date()): string {
	return formatInTimeZone(date, TIMEZONE, "yyyy-MM-dd'T'HH:mm");
}
