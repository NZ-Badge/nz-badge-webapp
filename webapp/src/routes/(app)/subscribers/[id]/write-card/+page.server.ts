import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/db';
import { subscribers, cardRfid } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params }) => {
	const subscriberId = Number(params.id);
	if (isNaN(subscriberId)) error(400, 'Invalid subscriber ID');

	const [subscriber] = await db
		.select()
		.from(subscribers)
		.where(eq(subscribers.id, subscriberId))
		.limit(1);

	if (!subscriber) error(404, 'Subscriber not found');

	// Verifica che l'iscritto non abbia già una carta attiva
	const [activeCard] = await db
		.select({ id: cardRfid.id })
		.from(cardRfid)
		.where(and(eq(cardRfid.subscriberId, subscriberId), eq(cardRfid.status, 'active')))
		.limit(1);

	if (activeCard) {
		redirect(303, `/subscribers?error=subscriber_has_active_card`);
	}

	return {
		subscriber: {
			id: subscriber.id,
			firstName: subscriber.firstName,
			lastName: subscriber.lastName,
			email: subscriber.email
		}
	};
};
