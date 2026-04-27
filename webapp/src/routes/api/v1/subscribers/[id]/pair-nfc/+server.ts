import type { RequestEvent } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/db';
import { subscribers, cardRfid } from '$lib/db/schema';
import { ok, badRequest, unauthorized, notFound, conflict, serverError } from '$lib/utils/api';
import { AuthError } from '$lib/services/auth';

export async function POST(event: RequestEvent): Promise<Response> {
	try {
		await event.locals.verifyAdmin();
	} catch (err) {
		return err instanceof AuthError ? unauthorized(err.message) : serverError();
	}

	const id = parseInt(event.params.id ?? '');
	if (isNaN(id)) return badRequest('invalid id');

	let body: { uid?: string };
	try {
		body = await event.request.json();
	} catch {
		return badRequest('invalid JSON body');
	}

	const uid = body.uid?.trim().toUpperCase();
	if (!uid || !/^[A-F0-9]{2}(:[A-F0-9]{2}){3,6}$/.test(uid)) {
		return badRequest('uid mancante o non valido (formato atteso: AA:BB:CC:DD)');
	}

	try {
		const [subscriber] = await db
			.select({ id: subscribers.id })
			.from(subscribers)
			.where(eq(subscribers.id, id))
			.limit(1);

		if (!subscriber) return notFound('subscriber not found');

		// Controlla se l'UID è già registrato
		const [existing] = await db
			.select({ id: cardRfid.id, subscriberId: cardRfid.subscriberId, status: cardRfid.status })
			.from(cardRfid)
			.where(eq(cardRfid.uid, uid))
			.limit(1);

		if (existing) {
			if (existing.status === 'active' && existing.subscriberId === id) {
				return ok({ uid, alreadyPaired: true });
			}
			return conflict(`UID già registrato (card id=${existing.id}, stato=${existing.status})`);
		}

		// Crea la card virtuale NFC
		await db.insert(cardRfid).values({
			uid,
			type: 'nfc',
			subscriberId: id,
			status: 'active',
			writeDate: new Date()
		});

		return ok({ uid, paired: true });
	} catch (err) {
		console.error('[pair-nfc] POST error:', err);
		return serverError();
	}
}
