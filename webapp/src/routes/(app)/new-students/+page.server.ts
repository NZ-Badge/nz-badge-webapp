import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { ZodError } from 'zod';
import { getNewStudents, selectedDateRange } from '$lib/services/new-students';

export const load: PageServerLoad = async ({ url }) => {
	let range;
	try {
		range = selectedDateRange(url.searchParams.get('from'), url.searchParams.get('to'));
	} catch (cause) {
		if (cause instanceof ZodError || cause instanceof RangeError)
			error(400, 'Intervallo di date non valido.');
		throw cause;
	}
	return { range, rows: await getNewStudents(range.start, range.next) };
};
