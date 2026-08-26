import type { PageServerLoad } from './$types';
import { db } from '$lib/db';
import { cardRfid, subscribers } from '$lib/db/schema';
import { and, eq, count, isNotNull, ne } from 'drizzle-orm';

const PAGE_SIZE = 25;

export const load: PageServerLoad = async ({ url }) => {
	const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
	const status = url.searchParams.get('status') ?? '';
	const tab = url.searchParams.get('tab') ?? 'active';

	if (tab === 'history') {
		const whereClause = and(isNotNull(cardRfid.subscriberId), eq(cardRfid.status, 'deleted'));

		const [cards, [{ total }]] = await Promise.all([
			db
				.select({
					id: cardRfid.id,
					uid: cardRfid.uid,
					status: cardRfid.status,
					writeDate: cardRfid.writeDate,
					expirationDate: cardRfid.expirationDate,
					deletedAt: cardRfid.deletedAt,
					subscriberName: subscribers.firstName,
					subscriberSurname: subscribers.lastName
				})
				.from(cardRfid)
				.leftJoin(subscribers, eq(cardRfid.subscriberId, subscribers.id))
				.where(whereClause)
				.limit(PAGE_SIZE)
				.offset((page - 1) * PAGE_SIZE),
			db.select({ total: count() }).from(cardRfid).where(whereClause)
		]);

		return { cards, total, page, totalPages: Math.ceil(total / PAGE_SIZE), status, tab };
	}

	// Vista principale: escludi sempre le card deleted
	const validStatuses = ['active', 'disabled', 'replaced', 'lost'] as const;
	const statusClause =
		status && validStatuses.includes(status as (typeof validStatuses)[number])
			? eq(cardRfid.status, status as (typeof validStatuses)[number])
			: ne(cardRfid.status, 'deleted');
	const whereClause = and(isNotNull(cardRfid.subscriberId), statusClause);

	const [cards, [{ total }]] = await Promise.all([
		db
			.select({
				id: cardRfid.id,
				uid: cardRfid.uid,
				status: cardRfid.status,
				writeDate: cardRfid.writeDate,
				expirationDate: cardRfid.expirationDate,
				deletedAt: cardRfid.deletedAt,
				subscriberName: subscribers.firstName,
				subscriberSurname: subscribers.lastName
			})
			.from(cardRfid)
			.leftJoin(subscribers, eq(cardRfid.subscriberId, subscribers.id))
			.where(whereClause)
			.limit(PAGE_SIZE)
			.offset((page - 1) * PAGE_SIZE),
		db.select({ total: count() }).from(cardRfid).where(whereClause)
	]);

	return { cards, total, page, totalPages: Math.ceil(total / PAGE_SIZE), status, tab };
};
