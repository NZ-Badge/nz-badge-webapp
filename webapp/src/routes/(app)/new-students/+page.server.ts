import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { z, ZodError } from 'zod';
import { countNewStudents, getNewStudents, selectedDateRange } from '$lib/services/new-students';
import { requirePageUser } from '$lib/services/auth';

const PAGE_SIZE = 25;

export const load: PageServerLoad = async ({ url, locals }) => {
	await requirePageUser(locals);
	let range;
	try {
		range = selectedDateRange(url.searchParams.get('from'), url.searchParams.get('to'));
	} catch (cause) {
		if (cause instanceof ZodError || cause instanceof RangeError)
			error(400, 'Intervallo di date non valido.');
		throw cause;
	}
	const parsedPage = z.coerce
		.number()
		.int()
		.positive()
		.safeParse(url.searchParams.get('page') ?? '1');
	const requestedPage = parsedPage.success ? parsedPage.data : 1;
	const total = await countNewStudents(range.start, range.next);
	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
	const page = Math.min(requestedPage, totalPages);
	const rows = await getNewStudents(range.start, range.next, {
		limit: PAGE_SIZE,
		offset: (page - 1) * PAGE_SIZE
	});
	return { range, rows, total, page, totalPages };
};
