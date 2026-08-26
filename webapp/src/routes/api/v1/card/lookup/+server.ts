import type { RequestEvent } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/db';
import { cardRfid, subscribers, users } from '$lib/db/schema';
import { ok, badRequest, unauthorized, serverError } from '$lib/utils/api';
import { AuthError } from '$lib/services/auth';

export async function GET(event: RequestEvent): Promise<Response> {
	try {
		await event.locals.verifyAdmin();
	} catch (err) {
		return err instanceof AuthError ? unauthorized(err.message) : serverError();
	}

	const uid = event.url.searchParams.get('uid');
	if (!uid || uid.trim() === '') {
		return badRequest('uid required');
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
		console.error('[card/lookup] GET error:', err);
		return serverError();
	}
}
