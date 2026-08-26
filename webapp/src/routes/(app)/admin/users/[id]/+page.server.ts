import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '$lib/db';
import { cardRfid, users } from '$lib/db/schema';
import { requireStaffManager } from '$lib/services/auth';
import {
	getCurrentMonthDateRange,
	getStaffAttendanceReport,
	normalizeStaffAttendanceRange
} from '$lib/services/staff-attendance';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const actor = await locals.verifyAdmin();
	requireStaffManager(actor);
	const userId = Number(params.id);
	if (!Number.isInteger(userId) || userId <= 0) error(400, 'ID utente non valido');

	const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
	if (!target) error(404, 'Utente non trovato');

	const range = normalizeStaffAttendanceRange(
		url.searchParams.get('from'),
		url.searchParams.get('to'),
		getCurrentMonthDateRange()
	);
	const [report, cards, activeUsers] = await Promise.all([
		getStaffAttendanceReport(target.id, range),
		db
			.select({
				id: cardRfid.id,
				uid: cardRfid.uid,
				type: cardRfid.type,
				status: cardRfid.status,
				writeDate: cardRfid.writeDate,
				expirationDate: cardRfid.expirationDate,
				writtenByDevice: cardRfid.writtenByDevice
			})
			.from(cardRfid)
			.where(and(eq(cardRfid.userId, target.id), eq(cardRfid.type, 'rfid')))
			.orderBy(desc(cardRfid.writeDate), desc(cardRfid.id)),
		db
			.select({ id: users.id, name: users.name, email: users.email })
			.from(users)
			.where(eq(users.status, 'active'))
			.orderBy(users.name)
	]);

	return {
		targetUser: {
			id: target.id,
			name: target.name,
			email: target.email,
			role: target.role,
			status: target.status
		},
		report,
		from: range.from,
		to: range.to,
		cards,
		activeUsers,
		canManageCards: true
	};
};
