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
