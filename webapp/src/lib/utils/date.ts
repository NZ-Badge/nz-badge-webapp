import { formatInTimeZone, toDate } from 'date-fns-tz';

export const TIMEZONE = 'Europe/Rome';

/**
 * Restituisce la data/ora corrente in timezone Europe/Rome
 */
export function nowInRome(): Date {
	return toDate(new Date(), { timeZone: TIMEZONE });
}

/**
 * Converte un timestamp (stringa o numero) in una data con timezone Europe/Rome
 */
export function parseToRomeDate(timestamp: string | number | Date): Date {
	const date = typeof timestamp === 'object' ? timestamp : new Date(timestamp);
	return toDate(date, { timeZone: TIMEZONE });
}

/**
 * Formatta una data in formato ISO con timezone Europe/Rome
 * Usato principalmente per server_time nelle risposte API
 */
export function formatToRomeISO(date: Date = new Date()): string {
	return formatInTimeZone(date, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss.SSSxxx");
}

/**
 * Converte una data in formato Date per il salvataggio nel database.
 * Il valore viene salvato come UTC; la conversione a Europe/Rome avviene solo al display.
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
