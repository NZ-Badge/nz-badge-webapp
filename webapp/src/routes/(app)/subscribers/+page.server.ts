import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/db';
import { subscribers, cardRfid } from '$lib/db/schema';
import { eq, like, or, and, count } from 'drizzle-orm';
import { enrichSubscribersForList, type SubscriberListRow } from '$lib/services/subscriber-list';

const PAGE_SIZE = 25;
const SORT_FIELDS = ['name', 'email', 'latestCourseAttendance', 'lastEntryAt', 'card'] as const;

type SortField = (typeof SORT_FIELDS)[number];
type SortDirection = 'asc' | 'desc';

function parseSortField(value: string | null): SortField {
	return SORT_FIELDS.find((field) => field === value) ?? 'name';
}

function parseSortDirection(value: string | null): SortDirection {
	return value === 'desc' ? 'desc' : 'asc';
}

function compareNullableValues<T>(
	left: T | null | undefined,
	right: T | null | undefined,
	compare: (leftValue: T, rightValue: T) => number,
	direction: SortDirection
): number {
	if (left == null && right == null) return 0;
	if (left == null) return 1;
	if (right == null) return -1;

	const result = compare(left, right);
	return direction === 'desc' ? -result : result;
}

function sortSubscribers(
	subscriberRows: SubscriberListRow[],
	sort: SortField,
	dir: SortDirection
): SubscriberListRow[] {
	const collator = new Intl.Collator('it', { sensitivity: 'base', numeric: true });

	const compareText = (left: string, right: string) => collator.compare(left, right);
	const compareName = (left: SubscriberListRow, right: SubscriberListRow) =>
		compareText(left.firstName, right.firstName) ||
		compareText(left.lastName, right.lastName) ||
		left.id - right.id;
	const compareWithDirection = (result: number) => (dir === 'desc' ? -result : result);

	return [...subscriberRows].sort((left, right) => {
		let result = 0;

		switch (sort) {
			case 'email':
				result =
					compareWithDirection(compareText(left.email, right.email)) || compareName(left, right);
				break;
			case 'latestCourseAttendance':
				result =
					compareNullableValues(
						left.latestCourseAttendanceMinutes,
						right.latestCourseAttendanceMinutes,
						(leftValue, rightValue) => leftValue - rightValue,
						dir
					) || compareName(left, right);
				break;
			case 'lastEntryAt':
				result =
					compareNullableValues(
						left.lastEntryAt,
						right.lastEntryAt,
						(leftValue, rightValue) =>
							new Date(leftValue).getTime() - new Date(rightValue).getTime(),
						dir
					) || compareName(left, right);
				break;
			case 'card':
				result =
					compareWithDirection(
						Number(left.hasActiveCard || left.hasNfcPairing) -
							Number(right.hasActiveCard || right.hasNfcPairing) ||
							Number(left.hasActiveCard) - Number(right.hasActiveCard) ||
							Number(left.hasNfcPairing) - Number(right.hasNfcPairing)
					) || compareName(left, right);
				break;
			case 'name':
			default:
				result = compareWithDirection(compareName(left, right));
				break;
		}

		return result;
	});
}

export const load: PageServerLoad = async ({ url }) => {
	const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
	const q = url.searchParams.get('q')?.trim() ?? '';
	const sort = parseSortField(url.searchParams.get('sort'));
	const dir = parseSortDirection(url.searchParams.get('dir'));

	// Costruzione filtri
	const filters = [];
	if (q) {
		filters.push(
			or(
				like(subscribers.firstName, `%${q}%`),
				like(subscribers.lastName, `%${q}%`),
				like(subscribers.email, `%${q}%`)
			)
		);
	}

	const whereClause = filters.length > 0 ? and(...filters) : undefined;

	const [subscriberRows, [{ total }]] = await Promise.all([
		db
			.select({
				id: subscribers.id,
				firstName: subscribers.firstName,
				lastName: subscribers.lastName,
				email: subscribers.email,
				status: subscribers.status
			})
			.from(subscribers)
			.where(whereClause),
		db.select({ total: count() }).from(subscribers).where(whereClause)
	]);
	const subscriberList = sortSubscribers(await enrichSubscribersForList(subscriberRows), sort, dir);
	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
	const paginatedSubscribers = subscriberList.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

	return {
		subscribers: paginatedSubscribers,
		total,
		page,
		totalPages,
		q,
		sort,
		dir
	};
};

export const actions: Actions = {
	create: async ({ request }) => {
		const data = await request.formData();
		const firstName = data.get('firstName')?.toString().trim();
		const lastName = data.get('lastName')?.toString().trim();
		const email = data.get('email')?.toString().trim();

		if (!firstName || !lastName || !email) {
			return fail(400, { error: 'Nome, cognome ed email sono obbligatori', action: 'create' });
		}

		await db.insert(subscribers).values({
			firstName,
			lastName,
			email,
			phone: data.get('phone')?.toString().trim() || null,
			taxId: data.get('taxCode')?.toString().trim() || null,
			status: (data.get('status')?.toString() ?? 'active') as
				| 'active'
				| 'completed'
				| 'suspended'
				| 'cancelled',
			note: data.get('notes')?.toString().trim() || null
		});

		return { success: true, action: 'create' };
	},

	update: async ({ request }) => {
		const data = await request.formData();
		const id = Number(data.get('id'));
		if (!id) return fail(400, { error: 'ID iscritto mancante', action: 'update' });

		await db
			.update(subscribers)
			.set({
				firstName: data.get('firstName')?.toString().trim(),
				lastName: data.get('lastName')?.toString().trim(),
				email: data.get('email')?.toString().trim(),
				phone: data.get('phone')?.toString().trim() || null,
				taxId: data.get('taxCode')?.toString().trim() || null,
				status: (data.get('status')?.toString() ?? 'active') as
					| 'active'
					| 'completed'
					| 'suspended'
					| 'cancelled',
				note: data.get('notes')?.toString().trim() || null
			})
			.where(eq(subscribers.id, id));

		return { success: true, action: 'update' };
	},

	delete: async ({ request }) => {
		const data = await request.formData();
		const id = Number(data.get('id'));
		if (!id) return fail(400, { error: 'ID iscritto mancante', action: 'delete' });

		// Blocca se ha carta attiva
		const [activeCard] = await db
			.select({ id: cardRfid.id })
			.from(cardRfid)
			.where(and(eq(cardRfid.subscriberId, id), eq(cardRfid.status, 'active')))
			.limit(1);

		if (activeCard) {
			return fail(400, {
				error:
					'Non puoi eliminare un iscritto con una tessera attiva. Rimuovi prima la tessera dalla pagina Tessere.',
				action: 'delete'
			});
		}

		await db.delete(subscribers).where(eq(subscribers.id, id));
		return { success: true, action: 'delete' };
	}
};
