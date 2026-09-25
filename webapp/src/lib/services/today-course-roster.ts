import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { TIMEZONE } from '$lib/utils/date';

export interface TodayEnrollment {
	id: number;
	subscriberId: number | null;
	firstName: string | null;
	lastName: string | null;
	subscriberFirstName: string | null;
	subscriberLastName: string | null;
	productTitle: string | null;
	variantTitle: string | null;
}

export interface TodaySwipe {
	subscriberId: number | null;
	readTimestamp: Date;
}

export function getRomeDay(now: Date): { dateKey: string; start: Date; end: Date } {
	const dateKey = formatInTimeZone(now, TIMEZONE, 'yyyy-MM-dd');
	const next = new Date(`${dateKey}T00:00:00.000Z`);
	next.setUTCDate(next.getUTCDate() + 1);
	return {
		dateKey,
		start: fromZonedTime(`${dateKey}T00:00:00`, TIMEZONE),
		end: fromZonedTime(`${next.toISOString().slice(0, 10)}T00:00:00`, TIMEZONE)
	};
}

export function buildTodayRoster(enrollments: TodayEnrollment[], swipes: TodaySwipe[]) {
	const firstSwipe = new Map<number, Date>();
	for (const swipe of swipes) {
		if (swipe.subscriberId === null) continue;
		const previous = firstSwipe.get(swipe.subscriberId);
		if (!previous || swipe.readTimestamp < previous) {
			firstSwipe.set(swipe.subscriberId, swipe.readTimestamp);
		}
	}

	const roster = new Map<
		string,
		{
			key: string;
			subscriberId: number | null;
			name: string;
			courses: string[];
			firstSwipe: Date | null;
		}
	>();
	for (const enrollment of enrollments) {
		const key =
			enrollment.subscriberId === null
				? `enrollment:${enrollment.id}`
				: `subscriber:${enrollment.subscriberId}`;
		let row = roster.get(key);
		if (!row) {
			row = {
				key,
				subscriberId: enrollment.subscriberId,
				name:
					[
						enrollment.subscriberFirstName ?? enrollment.firstName,
						enrollment.subscriberLastName ?? enrollment.lastName
					]
						.filter(Boolean)
						.join(' ')
						.trim() || 'Nome non disponibile',
				courses: [],
				firstSwipe:
					enrollment.subscriberId === null
						? null
						: (firstSwipe.get(enrollment.subscriberId) ?? null)
			};
			roster.set(key, row);
		}
		const course =
			[enrollment.productTitle, enrollment.variantTitle].filter(Boolean).join(' · ') ||
			'Corso senza nome';
		if (!row.courses.includes(course)) row.courses.push(course);
	}

	return [...roster.values()].sort(
		(a, b) =>
			Number(Boolean(a.firstSwipe)) - Number(Boolean(b.firstSwipe)) ||
			a.name.localeCompare(b.name, 'it')
	);
}
