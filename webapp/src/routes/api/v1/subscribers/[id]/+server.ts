import type { RequestEvent } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/db';
import { subscribers, cardRfid } from '$lib/db/schema';
import {
	ok,
	badRequest,
	unauthorized,
	notFound,
	conflict,
	serverError,
	formatZodError
} from '$lib/utils/api';
import { AuthError } from '$lib/services/auth';
import {
	removeSubscriber,
	SubscriberServiceError,
	updateSubscriber
} from '$lib/services/subscribers';

function serviceFailure(err: unknown, context: string): Response {
	if (err instanceof SubscriberServiceError) {
		if (err.code === 'NOT_FOUND') return notFound('Subscriber not found');
		if (err.code === 'HAS_ACTIVE_CARD') return conflict(err.message);
		if (err.zodError) return badRequest(formatZodError(err.zodError));
	}
	console.error(`[subscribers/[id]] ${context} error:`, err);
	return serverError();
}

export async function GET(event: RequestEvent): Promise<Response> {
	try {
		await event.locals.verifyStaffOrAdmin();
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
		adminUser = await event.locals.verifyStaffOrAdmin();
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

	try {
		return ok(await updateSubscriber(id, body, adminUser));
	} catch (err) {
		return serviceFailure(err, 'PUT');
	}
}

export async function DELETE(event: RequestEvent): Promise<Response> {
	let adminUser;
	try {
		adminUser = await event.locals.verifyStaffOrAdmin();
	} catch (err) {
		return err instanceof AuthError ? unauthorized(err.message) : serverError();
	}

	const id = Number(event.params.id);
	if (isNaN(id) || id <= 0) return notFound('Invalid ID');

	try {
		// Soft delete (status 'cancelled'): see $lib/services/subscribers.
		return ok(await removeSubscriber(id, adminUser));
	} catch (err) {
		return serviceFailure(err, 'DELETE');
	}
}
