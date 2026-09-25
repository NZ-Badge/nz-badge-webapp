import type { RequestEvent } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/db';
import { cardRfid, subscribers, users } from '$lib/db/schema';
import { ok, badRequest, serverError, authErrorResponse } from '$lib/utils/api';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api/card/lookup');

export async function GET(event: RequestEvent): Promise<Response> {
	try {
		await event.locals.verifyStaffOrAdmin();
	} catch (err) {
		return authErrorResponse(err);
	}

	const uid = event.url.searchParams.get('uid');
	if (!uid || uid.trim() === '') {
		return badRequest('UID obbligatorio');
	}

	try {
		const rows = await db
			.select({ card: cardRfid, subscriber: subscribers, user: users })
			.from(cardRfid)
			.leftJoin(subscribers, eq(cardRfid.subscriberId, subscribers.id))
			.leftJoin(users, eq(cardRfid.userId, users.id))
			.where(eq(cardRfid.uid, uid))
			.limit(1);

		if (rows.length === 0) {
			return ok({ found: false });
		}

		const { card, subscriber, user } = rows[0];

		return ok({
			found: true,
			card: {
				id: card.id,
				uid: card.uid,
				status: card.status,
				writeDate: card.writeDate,
				expirationDate: card.expirationDate,
				sector: card.sector
			},
			subscriber: subscriber
				? {
						id: subscriber.id,
						firstName: subscriber.firstName,
						lastName: subscriber.lastName,
						email: subscriber.email,
						courseName: subscriber.courseName,
						status: subscriber.status
					}
				: null,
			user: user
				? { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status }
				: null
		});
	} catch (err) {
		log.error('GET failed', { err });
		return serverError();
	}
}
