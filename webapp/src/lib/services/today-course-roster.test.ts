import { describe, expect, it } from 'vitest';
import { buildTodayRoster, getRomeDay, type TodayEnrollment } from './today-course-roster';

const enrollment: TodayEnrollment = {
	id: 1,
	subscriberId: 7,
	firstName: 'Mario',
	lastName: 'Rossi',
	subscriberFirstName: 'Mario',
	subscriberLastName: 'Rossi',
	productTitle: 'Primo soccorso',
	variantTitle: null
};

describe('today course roster', () => {
	it('uses Rome civil day boundaries across the spring DST transition', () => {
		const day = getRomeDay(new Date('2026-03-29T22:30:00Z'));
		expect(day.dateKey).toBe('2026-03-30');
		expect(day.start.toISOString()).toBe('2026-03-29T22:00:00.000Z');
		expect(day.end.toISOString()).toBe('2026-03-30T22:00:00.000Z');

		const transition = getRomeDay(new Date('2026-03-29T12:00:00Z'));
		expect(transition.end.getTime() - transition.start.getTime()).toBe(23 * 60 * 60 * 1000);
	});

	it('groups multiple courses per subscriber and uses the earliest swipe', () => {
		const rows = buildTodayRoster(
			[enrollment, { ...enrollment, id: 2, productTitle: 'Sicurezza' }],
			[
				{ subscriberId: 7, readTimestamp: new Date('2026-09-25T10:00:00Z') },
				{ subscriberId: 7, readTimestamp: new Date('2026-09-25T08:00:00Z') }
			]
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].courses).toEqual(['Primo soccorso', 'Sicurezza']);
		expect(rows[0].firstSwipe?.toISOString()).toBe('2026-09-25T08:00:00.000Z');
	});

	it('keeps an unlinked enrollment distinct from a subscriber with the same name', () => {
		const rows = buildTodayRoster(
			[enrollment, { ...enrollment, id: 2, subscriberId: null }],
			[{ subscriberId: 7, readTimestamp: new Date('2026-09-25T08:00:00Z') }]
		);
		expect(rows).toHaveLength(2);
		expect(rows.find((row) => row.subscriberId === null)?.firstSwipe).toBeNull();
	});
});
