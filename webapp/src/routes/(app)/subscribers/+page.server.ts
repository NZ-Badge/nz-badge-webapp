import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requirePageStaff } from '$lib/services/auth';
import {
	listSubscribersPage,
	parseSortDirection,
	parseSubscriberListSortField
} from '$lib/services/subscriber-list';
import {
	createSubscriber,
	removeSubscriber,
	SubscriberServiceError,
	subscriberInputFromForm,
	updateSubscriber
} from '$lib/services/subscribers';

const PAGE_SIZE = 25;

export const load: PageServerLoad = async ({ url, locals }) => {
	await requirePageStaff(locals);
	const pageParam = Number(url.searchParams.get('page') ?? 1);
	const requestedPage = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
	const q = url.searchParams.get('q')?.trim() ?? '';
	const sort = parseSubscriberListSortField(url.searchParams.get('sort'));
	const dir = parseSortDirection(url.searchParams.get('dir'));

	// Filtri, ordinamento e paginazione in SQL; solo le righe della pagina vengono arricchite.
	const result = await listSubscribersPage({
		q,
		sort,
		dir,
		page: requestedPage,
		pageSize: PAGE_SIZE
	});

	return {
		subscribers: result.subscribers,
		total: result.total,
		page: result.page,
		totalPages: result.totalPages,
		q,
		sort,
		dir
	};
};

function actionFailure(err: unknown, action: 'create' | 'update' | 'delete') {
	if (err instanceof SubscriberServiceError) {
		const status = err.code === 'NOT_FOUND' ? 404 : 400;
		return fail(status, { error: err.message, action });
	}
	throw err;
}

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const user = await requirePageStaff(locals);
		const input = subscriberInputFromForm(await request.formData());

		if (!input.firstName || !input.lastName || !input.email) {
			return fail(400, { error: 'Nome, cognome ed email sono obbligatori', action: 'create' });
		}

		try {
			await createSubscriber(input, user);
		} catch (err) {
			return actionFailure(err, 'create');
		}
		return { success: true, action: 'create' };
	},

	update: async ({ request, locals }) => {
		const user = await requirePageStaff(locals);
		const data = await request.formData();
		const id = Number(data.get('id'));
		if (!id) return fail(400, { error: 'ID iscritto mancante', action: 'update' });

		try {
			await updateSubscriber(id, subscriberInputFromForm(data), user);
		} catch (err) {
			return actionFailure(err, 'update');
		}
		return { success: true, action: 'update' };
	},

	delete: async ({ request, locals }) => {
		const user = await requirePageStaff(locals);
		const data = await request.formData();
		const id = Number(data.get('id'));
		if (!id) return fail(400, { error: 'ID iscritto mancante', action: 'delete' });

		// Soft delete: l'iscritto passa allo stato 'cancelled' (vedi $lib/services/subscribers).
		try {
			await removeSubscriber(id, user);
		} catch (err) {
			return actionFailure(err, 'delete');
		}
		return { success: true, action: 'delete' };
	}
};
