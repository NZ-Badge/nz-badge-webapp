import { describe, expect, it } from 'vitest';
import { newStudentsCsv, selectedDateRange } from './new-students';

describe('selectedDateRange', () => {
	it('uses the current Rome week across a UTC date boundary', () => {
		expect(selectedDateRange(null, null, new Date('2026-09-20T22:30:00Z'))).toEqual({
			start: '2026-09-21',
			end: '2026-09-27',
			next: '2026-09-28'
		});
	});
	it('uses an inclusive custom range across months', () => {
		expect(selectedDateRange('2026-09-25', '2026-10-04')).toEqual({
			start: '2026-09-25',
			end: '2026-10-04',
			next: '2026-10-05'
		});
		expect(selectedDateRange('2026-09-25', '2026-09-25').next).toBe('2026-09-26');
	});
	it('rejects invalid and reversed dates', () => {
		expect(() => selectedDateRange('2026-02-30', '2026-03-05')).toThrow();
		expect(() => selectedDateRange('2026-10-04', '2026-09-25')).toThrow();
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
		expect(csv).toContain('"25/09/2026"');
	});
});
