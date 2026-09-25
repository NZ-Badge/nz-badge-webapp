import { describe, expect, it } from 'vitest';
import { newStudentsCsv, selectedWeek } from './new-students';

describe('selectedWeek', () => {
	it('uses the current Rome week across a UTC date boundary', () => {
		expect(selectedWeek(null, new Date('2026-09-20T22:30:00Z'))).toEqual({
			start: '2026-09-21',
			end: '2026-09-27',
			next: '2026-09-28'
		});
	});
	it('normalizes a selected future day to Monday and rejects invalid dates', () => {
		expect(selectedWeek('2026-10-04').start).toBe('2026-09-28');
		expect(selectedWeek('2026-13-01', new Date('2026-09-25T12:00:00Z')).start).toBe('2026-09-21');
	});
});

describe('newStudentsCsv', () => {
	it('quotes fields and prevents spreadsheet formulas', () => {
		const csv = newStudentsCsv([
			{
				id: 1,
				subscriberId: null,
				firstName: '=SUM(1,1)',
				lastName: 'Rossi',
				email: 'a@example.com',
				phone: null,
				productTitle: 'Corso; base',
				variantTitle: 'A "mattina"',
				startDate: new Date('2026-09-25T00:00:00Z'),
				endDate: null
			}
		]);
		expect(csv).toContain('"\'=SUM(1,1)"');
		expect(csv).toContain('"Corso; base";"A ""mattina"""');
		expect(csv).toContain('"2026-09-25"');
	});
});
