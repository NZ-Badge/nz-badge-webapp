import { describe, expect, it } from 'vitest';
import { findDuplicateGroups, planMerge, type MergeCandidate } from './subscriber-merge';

function candidate(overrides: Partial<MergeCandidate> & { id: number }): MergeCandidate {
	return {
		firstName: 'Mario',
		lastName: 'Rossi',
		email: 'mario@example.com',
		phone: null,
		taxId: null,
		note: null,
		status: 'active',
		courseName: null,
		courseStartDate: null,
		courseEndDate: null,
		activeRfidCards: 0,
		activeNfcCards: 0,
		enrollmentCount: 1,
		...overrides
	};
}

describe('findDuplicateGroups', () => {
	it('groups the same person by name plus email, ignoring case, accents and spaces', () => {
		const groups = findDuplicateGroups([
			candidate({ id: 1 }),
			candidate({ id: 2, firstName: ' mario ', lastName: 'ROSSI', email: 'Mario@Example.com' }),
			candidate({ id: 3, firstName: 'Nicolò', email: 'n@example.com' }),
			candidate({ id: 4, firstName: 'Nicolo', email: 'n@example.com' })
		]);

		expect(groups).toEqual([
			[1, 2],
			[3, 4]
		]);
	});

	it('groups by fiscal code even with different emails, transitively', () => {
		const groups = findDuplicateGroups([
			candidate({ id: 1, taxId: 'RSSMRA80A01H501U', email: 'a@example.com' }),
			candidate({ id: 2, taxId: 'rssmra80a01h501u', email: 'b@example.com' }),
			candidate({ id: 3, taxId: null, email: 'b@example.com' })
		]);

		expect(groups).toEqual([[1, 2, 3]]);
	});

	it('keeps apart different people sharing the buyer email or fiscal code', () => {
		const groups = findDuplicateGroups([
			candidate({ id: 1, firstName: 'Mario', email: 'buyer@example.com', taxId: 'X' }),
			candidate({ id: 2, firstName: 'Luca', email: 'buyer@example.com', taxId: 'X' }),
			candidate({ id: 3, firstName: '', lastName: '', email: 'buyer@example.com' }),
			candidate({ id: 4, firstName: '', lastName: '', email: 'buyer@example.com' })
		]);

		expect(groups).toEqual([]);
	});
});

describe('planMerge', () => {
	it('keeps the subscriber with the active card and fills missing data from the others', () => {
		const plan = planMerge([
			candidate({ id: 1, phone: '333', note: 'Allergia', courseStartDate: '2026-01-10' }),
			candidate({
				id: 2,
				activeRfidCards: 1,
				note: 'Pagato',
				courseName: 'Corso avanzato',
				courseStartDate: '2026-09-01',
				courseEndDate: '2026-09-30'
			})
		]);

		expect(plan.survivor.id).toBe(2);
		expect(plan.duplicates.map((d) => d.id)).toEqual([1]);
		expect(plan.conflicts).toEqual([]);
		expect(plan.survivorUpdate).toEqual({ phone: '333', note: 'Allergia\nPagato' });
	});

	it('prefers a non-cancelled subscriber, then the oldest, and copies the latest course', () => {
		const plan = planMerge([
			candidate({ id: 1, status: 'cancelled', courseStartDate: '2026-01-10' }),
			candidate({ id: 3, courseStartDate: '2026-03-01' }),
			candidate({
				id: 2,
				courseName: 'Ultimo',
				courseStartDate: '2026-09-01',
				courseEndDate: '2026-09-30'
			})
		]);

		expect(plan.survivor.id).toBe(2);
		expect(plan.survivorUpdate).toEqual({});
	});

	it('reactivates a cancelled survivor and copies the latest course fields', () => {
		const plan = planMerge([
			candidate({ id: 1, status: 'cancelled', activeNfcCards: 1 }),
			candidate({
				id: 2,
				status: 'completed',
				courseName: 'Ultimo',
				courseStartDate: '2026-09-01',
				courseEndDate: '2026-09-30'
			})
		]);

		expect(plan.survivor.id).toBe(1);
		expect(plan.survivorUpdate).toEqual({
			status: 'completed',
			courseName: 'Ultimo',
			courseStartDate: '2026-09-01',
			courseEndDate: '2026-09-30'
		});
	});

	it('reports conflicts that need a manual decision', () => {
		const plan = planMerge([
			candidate({ id: 1, activeRfidCards: 1, taxId: 'AAA' }),
			candidate({ id: 2, activeRfidCards: 1, taxId: 'BBB' })
		]);

		expect(plan.conflicts).toEqual([
			'più di un subscriber ha una card RFID attiva',
			'codici fiscali diversi'
		]);
	});
});
