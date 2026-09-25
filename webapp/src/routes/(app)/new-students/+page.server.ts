import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { ZodError } from 'zod';
import { countNewStudents, getNewStudents, selectedDateRange } from '$lib/services/new-students';
import { requirePageUser } from '$lib/services/auth';
import { clampPagination, parsePagination } from '$lib/utils/pagination';

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
	const requested = parsePagination(url, PAGE_SIZE);
	const total = await countNewStudents(range.start, range.next);
	const { page, offset, totalPages } = clampPagination(requested, total);
	const rows = await getNewStudents(range.start, range.next, { limit: PAGE_SIZE, offset });
	return { range, rows, total, page, totalPages };
};
