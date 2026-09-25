import type { PageServerLoad } from './$types';
import { getNewStudents, selectedWeek } from '$lib/services/new-students';

export const load: PageServerLoad = async ({ url }) => {
	const week = selectedWeek(url.searchParams.get('week'));
	return { week, rows: await getNewStudents(week.start, week.next) };
};
