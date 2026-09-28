import { describe, expect, it } from 'vitest';
import { MySqlDialect } from 'drizzle-orm/mysql-core';
import {
	groupNewStudents,
	newStudentsFilter,
	newStudentsCsv,
	selectedDateRange,
	type NewStudentEnrollment
} from './new-students';

describe('newStudentsFilter', () => {
	it('uses calendar dates as SQL DATE bounds for the Rome week', () => {
		const query = new MySqlDialect().sqlToQuery(newStudentsFilter('2026-09-28', '2026-10-05'));
		expect(query.params.slice(0, 2)).toEqual(['2026-09-28', '2026-10-05']);
		expect(query.sql).toContain('cast(? as date)');
	});
});

function enrollment(
	overrides: Partial<NewStudentEnrollment> & { id: number }
): NewStudentEnrollment {
	return {
		subscriberId: 7,
		firstName: 'Mario',
		lastName: 'Rossi',
		subscriberFirstName: 'Mario',
		subscriberLastName: 'Rossi',
		email: 'mario@example.com',
		phone: null,
		productTitle: 'Corso base',
		variantTitle: null,
		startDate: '2026-09-21',
		endDate: null,
		...overrides
	};
}

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

describe('groupNewStudents', () => {
	it('shows a subscriber once with all the courses starting in the range', () => {
		const rows = groupNewStudents([
			enrollment({ id: 2, productTitle: 'Avanzato', startDate: '2026-09-24', phone: '333' }),
			enrollment({ id: 1, startDate: '2026-09-21' }),
			enrollment({ id: 3, subscriberId: 8, firstName: 'Luca', subscriberFirstName: 'Luca' })
		]);

		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({ key: 's:7', startDate: '2026-09-21', phone: '333' });
		expect(rows[0].courses.map((course) => course.id)).toEqual([1, 2]);
		expect(rows[1]).toMatchObject({ key: 's:8', firstName: 'Luca' });
	});

	it('keeps unlinked enrollments as separate rows', () => {
		const unlinked = { subscriberId: null, subscriberFirstName: null, subscriberLastName: null };
		const rows = groupNewStudents([
			enrollment({ id: 1, ...unlinked }),
			enrollment({ id: 2, ...unlinked })
		]);

		expect(rows.map((row) => row.key)).toEqual(['e:1', 'e:2']);
	});
});

describe('newStudentsCsv', () => {
	it('quotes fields and prevents spreadsheet formulas', () => {
		const csv = newStudentsCsv(
			groupNewStudents([
				enrollment({
					id: 1,
					subscriberId: null,
					firstName: '=SUM(1,1)',
					subscriberFirstName: null,
					email: 'a@example.com',
					productTitle: 'Corso; base',
					variantTitle: 'A "mattina"',
					startDate: new Date('2026-09-25T00:00:00Z')
				})
			])
		);
		expect(csv).toContain('"\'=SUM(1,1)"');
		expect(csv).toContain('"Corso; base";"A ""mattina"""');
		expect(csv).toContain('"25/09/2026"');
	});

	it('writes one line per student with the courses side by side', () => {
		const csv = newStudentsCsv(
			groupNewStudents([
				enrollment({ id: 1, startDate: '2026-09-21', endDate: '2026-09-30' }),
				enrollment({ id: 2, productTitle: 'Avanzato', startDate: '2026-09-24' })
			])
		);
		const lines = csv.trim().split('\r\n');
		expect(lines).toHaveLength(2);
		expect(lines[1]).toContain('"Corso base | Avanzato"');
		expect(lines[1]).toContain('"21/09/2026 | 24/09/2026";"30/09/2026 | "');
	});
});
