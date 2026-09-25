import type { RequestHandler } from './$types';
import { getNewStudents, newStudentsCsv, selectedDateRange } from '$lib/services/new-students';
import { authErrorResponse, badRequest } from '$lib/utils/api';
import { ZodError } from 'zod';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		await locals.verifyUser();
	} catch (error) {
		return authErrorResponse(error);
	}
	let range;
	try {
		range = selectedDateRange(url.searchParams.get('from'), url.searchParams.get('to'));
	} catch (error) {
		if (error instanceof ZodError || error instanceof RangeError)
			return badRequest('Intervallo di date non valido');
		throw error;
	}
	const rows = await getNewStudents(range.start, range.next);
	return new Response(newStudentsCsv(rows), {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="nuovi-corsisti-${range.start}-${range.end}.csv"`,
			'Cache-Control': 'private, no-store'
		}
	});
};
