import type { RequestEvent } from '@sveltejs/kit';
import { eq, and, count } from 'drizzle-orm';
import { db } from '$lib/db';
import { cardRfid, subscribers } from '$lib/db/schema';
import { cardQuerySchema } from '$lib/utils/validation';
import { ok, badRequest, unauthorized, serverError, formatZodError } from '$lib/utils/api';
import { AuthError } from '$lib/services/auth';

export async function GET(event: RequestEvent): Promise<Response> {
	try {
		await event.locals.verifyAdmin();
	} catch (err) {
		return err instanceof AuthError ? unauthorized(err.message) : serverError();
	}

	const parsed = cardQuerySchema.safeParse(Object.fromEntries(event.url.searchParams));
	if (!parsed.success) return badRequest(formatZodError(parsed.error));

	const { status, subscriber_id, page, limit } = parsed.data;
	const offset = (page - 1) * limit;

	const conditions = [];
	if (status) conditions.push(eq(cardRfid.status, status));
	if (subscriber_id) conditions.push(eq(cardRfid.subscriberId, subscriber_id));
	const where = conditions.length > 0 ? and(...conditions) : undefined;

	try {
		const [cards, [{ total }]] = await Promise.all([
			db
				.select({ card: cardRfid, subscriber: subscribers })
				.from(cardRfid)
				.leftJoin(subscribers, eq(cardRfid.subscriberId, subscribers.id))
				.where(where)
				.limit(limit)
				.offset(offset),
			db.select({ total: count() }).from(cardRfid).where(where)
		]);

		return ok({ cards, total, page, limit });
	} catch (err) {
		console.error('[card] GET error:', err);
		return serverError();
	}
}
