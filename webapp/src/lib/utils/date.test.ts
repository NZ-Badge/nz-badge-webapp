import { describe, expect, it } from 'vitest';
import {
	formatDateIT,
	formatDateTimeIT,
	formatTimeIT,
	toRomeDateTimeInputValue,
	toRomeDateInputValue
} from './date';

// 2026-03-29 e' il giorno del cambio DST in Europa (02:00 -> 03:00)
const WINTER_UTC = '2026-01-15T12:00:00.000Z'; // 13:00 a Roma (UTC+1)
const SUMMER_UTC = '2026-07-15T12:00:00.000Z'; // 14:00 a Roma (UTC+2)

describe('formatDateIT', () => {
	it('formatta sempre in gg/mm/aaaa', () => {
		expect(formatDateIT(WINTER_UTC)).toBe('15/01/2026');
		expect(formatDateIT(new Date(SUMMER_UTC))).toBe('15/07/2026');
	});

	it('usa la timezone Europe/Rome anche vicino alla mezzanotte', () => {
		// 23:30 UTC del 14/01 -> 00:30 del 15/01 a Roma
		expect(formatDateIT('2026-01-14T23:30:00.000Z')).toBe('15/01/2026');
	});

	it('restituisce stringa vuota per valori nullish o non validi', () => {
		expect(formatDateIT(null)).toBe('');
		expect(formatDateIT(undefined)).toBe('');
		expect(formatDateIT('')).toBe('');
		expect(formatDateIT('non-una-data')).toBe('');
		expect(formatDateIT('2026-02-30')).toBe('');
		expect(formatDateIT(new Date(NaN))).toBe('');
	});

	it('mantiene date senza orario, anni a quattro cifre e giorni bisestili', () => {
		expect(formatDateIT('2028-02-29')).toBe('29/02/2028');
		expect(formatDateIT('2026-01-05')).toBe('05/01/2026');
		expect(formatDateIT(Date.parse(WINTER_UTC))).toBe('15/01/2026');
	});
});

describe('toRomeDateInputValue', () => {
	it('allinea il valore del picker alla data visualizzata anche fuori dal fuso italiano', () => {
		expect(toRomeDateInputValue(new Date('2026-01-14T23:30:00Z'))).toBe('2026-01-15');
		expect(toRomeDateInputValue('2028-02-29')).toBe('2028-02-29');
		expect(toRomeDateInputValue('2026-02-29')).toBe('');
		expect(toRomeDateInputValue(null)).toBe('');
	});
});

describe('formatTimeIT', () => {
	it('usa sempre il formato 24h', () => {
		expect(formatTimeIT(WINTER_UTC)).toBe('13:00');
		expect(formatTimeIT(SUMMER_UTC)).toBe('14:00');
	});

	it('formatta mezzanotte come 00:00 e mai in formato 12h', () => {
		expect(formatTimeIT('2026-01-14T23:00:00.000Z')).toBe('00:00');
		expect(formatTimeIT('2026-01-15T22:05:00.000Z')).toBe('23:05');
	});

	it('supporta i secondi opzionali', () => {
		expect(formatTimeIT('2026-01-15T12:34:56.000Z', { seconds: true })).toBe('13:34:56');
	});
});

describe('formatDateTimeIT', () => {
	it('formatta data e ora in gg/mm/aaaa HH:mm', () => {
		expect(formatDateTimeIT(WINTER_UTC)).toBe('15/01/2026 13:00');
		expect(formatDateTimeIT(SUMMER_UTC, { seconds: true })).toBe('15/07/2026 14:00:00');
	});

	it('resta corretta attorno al cambio DST', () => {
		// 01:30 UTC del 29/03/2026 -> 03:30 a Roma (salto in avanti)
		expect(formatDateTimeIT('2026-03-29T01:30:00.000Z')).toBe('29/03/2026 03:30');
		// 25/10/2026 00:30 UTC -> 02:30 a Roma (ora solare)
		expect(formatDateTimeIT('2026-10-25T00:30:00.000Z')).toBe('25/10/2026 02:30');
	});
});

describe('toRomeDateTimeInputValue', () => {
	it('produce yyyy-MM-ddTHH:mm in Europe/Rome per i form', () => {
		expect(toRomeDateTimeInputValue(new Date(WINTER_UTC))).toBe('2026-01-15T13:00');
		expect(toRomeDateTimeInputValue(new Date(SUMMER_UTC))).toBe('2026-07-15T14:00');
	});
});
