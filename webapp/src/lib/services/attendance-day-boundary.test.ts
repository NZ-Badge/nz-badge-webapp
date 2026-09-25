import { describe, expect, it } from 'vitest';
import { isSameRomeDay } from '$lib/services/attendance';

// Il container gira in UTC: gli swipe tra le 00:00 e le 02:00 di Roma devono contare sul giorno
// di Roma, non su quello UTC.
describe('isSameRomeDay', () => {
	it('separa un entry serale da uno swipe dopo la mezzanotte di Roma', () => {
		// 22:30 del 10/03 a Roma vs 00:30 dell'11/03 a Roma: stesso giorno UTC, giorni diversi a Roma.
		expect(isSameRomeDay('2026-03-10T21:30:00Z', '2026-03-10T23:30:00Z')).toBe(false);
	});

	it('unisce uno swipe dopo la mezzanotte di Roma con il resto della giornata romana', () => {
		// 00:30 e 10:00 dell'11/03 a Roma: giorni UTC diversi, stesso giorno a Roma.
		expect(isSameRomeDay(new Date('2026-03-10T23:30:00Z'), new Date('2026-03-11T09:00:00Z'))).toBe(
			true
		);
	});

	it('gestisce anche l’ora legale (UTC+2)', () => {
		expect(isSameRomeDay('2026-07-15T21:59:00Z', '2026-07-15T22:01:00Z')).toBe(false);
		expect(isSameRomeDay('2026-07-15T22:01:00Z', '2026-07-16T08:00:00Z')).toBe(true);
	});
});
