import type { RequestEvent } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/db';
import { subscribers, cardRfid, auditLog } from '$lib/db/schema';
import { subscriberUpdateSchema } from '$lib/utils/validation';
import {
	ok,
	badRequest,
	unauthorized,
	notFound,
	serverError,
	formatZodError
} from '$lib/utils/api';
import { AuthError } from '$lib/services/auth';

export async function GET(event: RequestEvent): Promise<Response> {
	try {
		await event.locals.verifyAdmin();
	} catch (err) {
		return err instanceof AuthError ? unauthorized(err.message) : serverError();
	}

	const id = Number(event.params.id);
	if (isNaN(id) || id <= 0) return notFound('Invalid ID');

	const [subscriber] = await db.select().from(subscribers).where(eq(subscribers.id, id)).limit(1);
	if (!subscriber) return notFound('Subscriber not found');

	const cards = await db.select().from(cardRfid).where(eq(cardRfid.subscriberId, id));
	return ok({ ...subscriber, cards });
}

export async function PUT(event: RequestEvent): Promise<Response> {
	let adminUser;
	try {
		adminUser = await event.locals.verifyAdmin();
	} catch (err) {
		return err instanceof AuthError ? unauthorized(err.message) : serverError();
	}

	const id = Number(event.params.id);
	if (isNaN(id) || id <= 0) return notFound('Invalid ID');

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return badRequest('Invalid JSON body');
	}

	const parsed = subscriberUpdateSchema.safeParse(body);
	if (!parsed.success) return badRequest(formatZodError(parsed.error));

	try {
		const [existing] = await db.select().from(subscribers).where(eq(subscribers.id, id)).limit(1);
		if (!existing) return notFound('Subscriber not found');

		await db
			.update(subscribers)
			.set({
				...parsed.data,
				purchaseDate: parsed.data.purchaseDate ? new Date(parsed.data.purchaseDate) : undefined,
				courseStartDate: parsed.data.courseStartDate
					? new Date(parsed.data.courseStartDate)
					: undefined,
				courseEndDate: parsed.data.courseEndDate ? new Date(parsed.data.courseEndDate) : undefined
			})
			.where(eq(subscribers.id, id));

		const [updated] = await db.select().from(subscribers).where(eq(subscribers.id, id)).limit(1);

		await db.insert(auditLog).values({
			userId: adminUser.id,
			action: 'subscriber_update',
			entityType: 'subscribers',
			entityId: id,
			dataBefore: existing as unknown as Record<string, unknown>,
			dataAfter: updated as unknown as Record<string, unknown>
		});

		return ok(updated);
	} catch (err) {
		console.error('[subscribers/[id]] PUT error:', err);
		return serverError();
	}
}

export async function DELETE(event: RequestEvent): Promise<Response> {
	let adminUser;
	try {
		adminUser = await event.locals.verifyAdmin();
	} catch (err) {
		return err instanceof AuthError ? unauthorized(err.message) : serverError();
	}

	const id = Number(event.params.id);
	if (isNaN(id) || id <= 0) return notFound('Invalid ID');

	try {
		const [existing] = await db.select().from(subscribers).where(eq(subscribers.id, id)).limit(1);
		if (!existing) return notFound('Subscriber not found');

		// Soft delete
		await db.update(subscribers).set({ status: 'cancelled' }).where(eq(subscribers.id, id));

		await db.insert(auditLog).values({
			userId: adminUser.id,
			action: 'subscriber_delete',
			entityType: 'subscribers',
			entityId: id,
			dataBefore: existing as unknown as Record<string, unknown>
		});

		const [updated] = await db.select().from(subscribers).where(eq(subscribers.id, id)).limit(1);
		return ok(updated);
	} catch (err) {
		console.error('[subscribers/[id]] DELETE error:', err);
		return serverError();
	}
}
