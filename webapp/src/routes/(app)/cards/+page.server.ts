import type { PageServerLoad } from './$types';
import { db } from '$lib/db';
import { cardRfid, subscribers, users } from '$lib/db/schema';
import { and, eq, count, isNotNull, ne, or, like, asc, desc, sql } from 'drizzle-orm';

const PAGE_SIZE = 25;
const SORT_FIELDS = ['subscriber', 'writeDate', 'expirationDate'] as const;

type SortField = (typeof SORT_FIELDS)[number];
type SortDirection = 'asc' | 'desc';

function parseSortField(value: string | null): SortField {
	return SORT_FIELDS.find((field) => field === value) ?? 'writeDate';
}

function parseSortDirection(value: string | null): SortDirection {
	return value === 'asc' ? 'asc' : 'desc';
}

export const load: PageServerLoad = async ({ url }) => {
	const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
	const status = url.searchParams.get('status') ?? '';
	const tab = url.searchParams.get('tab') ?? 'active';
	const q = url.searchParams.get('q')?.trim() ?? '';
	const sort = parseSortField(url.searchParams.get('sort'));
	const dir = parseSortDirection(url.searchParams.get('dir'));
	const ownerClause = or(isNotNull(cardRfid.subscriberId), isNotNull(cardRfid.userId));

	if (tab === 'history') {
		const whereClause = and(ownerClause, eq(cardRfid.status, 'deleted'));

		const [cards, [{ total }]] = await Promise.all([
			db
				.select({
					id: cardRfid.id,
					uid: cardRfid.uid,
					status: cardRfid.status,
					writeDate: cardRfid.writeDate,
					expirationDate: cardRfid.expirationDate,
					deletedAt: cardRfid.deletedAt,
					subscriberId: cardRfid.subscriberId,
					subscriberName: subscribers.firstName,
					subscriberSurname: subscribers.lastName,
					userName: users.name,
					userRole: users.role
				})
				.from(cardRfid)
				.leftJoin(subscribers, eq(cardRfid.subscriberId, subscribers.id))
				.leftJoin(users, eq(cardRfid.userId, users.id))
				.where(whereClause)
				.limit(PAGE_SIZE)
				.offset((page - 1) * PAGE_SIZE),
			db.select({ total: count() }).from(cardRfid).where(whereClause)
		]);

		return {
			cards,
			total,
			page,
			totalPages: Math.ceil(total / PAGE_SIZE),
			status,
			tab,
			q,
			sort,
			dir
		};
	}

	// Vista principale: escludi sempre le card deleted
	const validStatuses = ['active', 'disabled', 'replaced', 'lost'] as const;
	const statusClause =
		status && validStatuses.includes(status as (typeof validStatuses)[number])
			? eq(cardRfid.status, status as (typeof validStatuses)[number])
			: ne(cardRfid.status, 'deleted');
	const qClause = q
		? or(
				like(subscribers.firstName, `%${q}%`),
				like(subscribers.lastName, `%${q}%`),
				like(users.name, `%${q}%`)
			)
		: undefined;
	const whereClause = and(ownerClause, statusClause, qClause);

	const sortColumns =
		sort === 'subscriber'
			? [sql<string>`coalesce(${subscribers.firstName}, ${users.name})`, subscribers.lastName]
			: sort === 'expirationDate'
				? [cardRfid.expirationDate]
				: [cardRfid.writeDate];
	const orderBy = [
		...sortColumns.map((column) => (dir === 'desc' ? desc(column) : asc(column))),
		asc(cardRfid.id)
	];

	const [cards, [{ total }]] = await Promise.all([
		db
			.select({
				id: cardRfid.id,
				uid: cardRfid.uid,
				status: cardRfid.status,
				writeDate: cardRfid.writeDate,
				expirationDate: cardRfid.expirationDate,
				deletedAt: cardRfid.deletedAt,
				subscriberId: cardRfid.subscriberId,
				subscriberName: subscribers.firstName,
				subscriberSurname: subscribers.lastName,
				userName: users.name,
				userRole: users.role
			})
			.from(cardRfid)
			.leftJoin(subscribers, eq(cardRfid.subscriberId, subscribers.id))
			.leftJoin(users, eq(cardRfid.userId, users.id))
			.where(whereClause)
			.orderBy(...orderBy)
			.limit(PAGE_SIZE)
			.offset((page - 1) * PAGE_SIZE),
		db
			.select({ total: count() })
			.from(cardRfid)
			.leftJoin(subscribers, eq(cardRfid.subscriberId, subscribers.id))
			.leftJoin(users, eq(cardRfid.userId, users.id))
			.where(whereClause)
	]);

	return {
		cards,
		total,
		page,
		totalPages: Math.ceil(total / PAGE_SIZE),
		status,
		tab,
		q,
		sort,
		dir
	};
};
