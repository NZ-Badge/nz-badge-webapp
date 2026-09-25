import type { RequestEvent } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/db';
import { subscribers, cardRfid } from '$lib/db/schema';
import {
	ok,
	badRequest,
	notFound,
	conflict,
	serverError,
	formatZodError,
	authErrorResponse
} from '$lib/utils/api';
import {
	removeSubscriber,
	SubscriberServiceError,
	updateSubscriber
} from '$lib/services/subscribers';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api/subscribers/[id]');

function serviceFailure(err: unknown, context: string): Response {
	if (err instanceof SubscriberServiceError) {
		if (err.code === 'NOT_FOUND') return notFound('Iscritto non trovato');
		if (err.code === 'HAS_ACTIVE_CARD') return conflict(err.message);
		if (err.zodError) return badRequest(formatZodError(err.zodError));
	}
	log.error(`${context} failed`, { err });
	return serverError();
}

export async function GET(event: RequestEvent): Promise<Response> {
	try {
		await event.locals.verifyStaffOrAdmin();
	} catch (err) {
		return authErrorResponse(err);
	}

	const id = Number(event.params.id);
	if (isNaN(id) || id <= 0) return notFound('ID non valido');

	const [subscriber] = await db.select().from(subscribers).where(eq(subscribers.id, id)).limit(1);
	if (!subscriber) return notFound('Iscritto non trovato');

	const cards = await db.select().from(cardRfid).where(eq(cardRfid.subscriberId, id));
	return ok({ ...subscriber, cards });
}

export async function PUT(event: RequestEvent): Promise<Response> {
	let adminUser;
	try {
		adminUser = await event.locals.verifyStaffOrAdmin();
	} catch (err) {
		return authErrorResponse(err);
	}

	const id = Number(event.params.id);
	if (isNaN(id) || id <= 0) return notFound('ID non valido');

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return badRequest('JSON non valido');
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
		return authErrorResponse(err);
	}

	const id = Number(event.params.id);
	if (isNaN(id) || id <= 0) return notFound('ID non valido');

	try {
		// Soft delete (status 'cancelled'): see $lib/services/subscribers.
		return ok(await removeSubscriber(id, adminUser));
	} catch (err) {
		return serviceFailure(err, 'DELETE');
	}
}
