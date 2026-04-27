import type { RequestEvent } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/db';
import { cardRfid, auditLog } from '$lib/db/schema';
import { ok, unauthorized, notFound, badRequest, serverError } from '$lib/utils/api';
import { AuthError } from '$lib/services/auth';

export async function POST(event: RequestEvent): Promise<Response> {
	let adminUser;
	try {
		adminUser = await event.locals.verifyAdmin();
	} catch (err) {
		return err instanceof AuthError ? unauthorized(err.message) : serverError();
	}

	const id = Number(event.params.id);
	if (isNaN(id) || id <= 0) return notFound('Invalid card ID');

	try {
		const [existing] = await db.select().from(cardRfid).where(eq(cardRfid.id, id)).limit(1);
		if (!existing) return notFound('Card not found');
		if (existing.status !== 'disabled') return badRequest(`Card non è disabilitata (stato: ${existing.status})`);

		await db.update(cardRfid).set({ status: 'active' }).where(eq(cardRfid.id, id));

		await db.insert(auditLog).values({
			userId: adminUser.id,
			action: 'card_enable',
			entityType: 'card_rfid',
			entityId: id
		});

		const [updated] = await db.select().from(cardRfid).where(eq(cardRfid.id, id)).limit(1);
		return ok(updated);
	} catch (err) {
		console.error('[card/enable] error:', err);
		return serverError();
	}
}
