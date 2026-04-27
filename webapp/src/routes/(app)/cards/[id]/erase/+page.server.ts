import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/db';
import { cardRfid, subscribers } from '$lib/db/schema';
import { eq } from 'drizzle-orm';
import { isMifareEnabled } from '$lib/services/mifare-keys';

export const load: PageServerLoad = async ({ params }) => {
	const cardId = Number(params.id);
	if (isNaN(cardId)) error(400, 'Invalid card ID');

	const [row] = await db
		.select({
			id: cardRfid.id,
			uid: cardRfid.uid,
			status: cardRfid.status,
			sector: cardRfid.sector,
			subscriberFirstName: subscribers.firstName,
			subscriberLastName: subscribers.lastName
		})
		.from(cardRfid)
		.leftJoin(subscribers, eq(cardRfid.subscriberId, subscribers.id))
		.where(eq(cardRfid.id, cardId))
		.limit(1);

	if (!row) error(404, 'Card not found');
	if (row.status !== 'active' && row.status !== 'disabled' && row.status !== 'deleted')
		error(400, `Card non cancellabile (stato: ${row.status})`);

	const useMifare = await isMifareEnabled();

	return { card: row, use_mifare: useMifare };
};
