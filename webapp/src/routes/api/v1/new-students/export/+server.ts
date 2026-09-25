import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AuthError } from '$lib/services/auth';
import { getNewStudents, newStudentsCsv, selectedDateRange } from '$lib/services/new-students';
import { ZodError } from 'zod';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		await locals.verifyUser();
	} catch (error) {
		if (error instanceof AuthError)
			return json({ error: 'Accesso non autorizzato' }, { status: 401 });
		throw error;
	}
	let range;
	try {
		range = selectedDateRange(url.searchParams.get('from'), url.searchParams.get('to'));
	} catch (error) {
		if (error instanceof ZodError || error instanceof RangeError)
			return json({ error: 'Intervallo di date non valido' }, { status: 400 });
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
