import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/db';
import { cardRfid, users } from '$lib/db/schema';
import { requireStaffManager } from '$lib/services/auth';

export const load: PageServerLoad = async ({ locals, params }) => {
	const actor = await locals.verifyAdmin();
	requireStaffManager(actor);
	const userId = Number(params.id);
	if (!Number.isInteger(userId) || userId <= 0) error(400, 'ID utente non valido');

	const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
	if (!target) error(404, 'Utente non trovato');
	if (target.status !== 'active')
		error(409, 'Non è possibile assegnare una card a un utente disattivato');

	const [activeCard] = await db
		.select({ id: cardRfid.id })
		.from(cardRfid)
		.where(
			and(eq(cardRfid.userId, userId), eq(cardRfid.type, 'rfid'), eq(cardRfid.status, 'active'))
		)
		.limit(1);
	if (activeCard) redirect(303, `/admin/users/${userId}`);

	return {
		ownerType: 'user' as const,
		ownerLabel: 'Utente',
		backHref: `/admin/users/${userId}`,
		backLabel: target.name,
		subscriber: {
			id: target.id,
			firstName: target.name,
			lastName: '',
			email: target.email
		}
	};
};
