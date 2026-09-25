import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AuthError } from '$lib/services/auth';
import { getNewStudents, newStudentsCsv, selectedWeek } from '$lib/services/new-students';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		await locals.verifyUser();
	} catch (error) {
		if (error instanceof AuthError)
			return json({ error: 'Accesso non autorizzato' }, { status: 401 });
		throw error;
	}
	const week = selectedWeek(url.searchParams.get('week'));
	const rows = await getNewStudents(week.start, week.next);
	return new Response(newStudentsCsv(rows), {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="nuovi-corsisti-${week.start}.csv"`,
			'Cache-Control': 'private, no-store'
		}
	});
};
