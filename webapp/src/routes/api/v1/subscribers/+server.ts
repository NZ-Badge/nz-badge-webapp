import type { RequestEvent } from '@sveltejs/kit';
import { eq, and, like, or, count, SQL } from 'drizzle-orm';
import { db } from '$lib/db';
import { subscribers } from '$lib/db/schema';
import { subscribersQuerySchema } from '$lib/utils/validation';
import {
	ok,
	created,
	badRequest,
	serverError,
	formatZodError,
	authErrorResponse
} from '$lib/utils/api';
import { createSubscriber, SubscriberServiceError } from '$lib/services/subscribers';

export async function GET(event: RequestEvent): Promise<Response> {
	try {
		await event.locals.verifyStaffOrAdmin();
	} catch (err) {
		return authErrorResponse(err);
	}

	const parsed = subscribersQuerySchema.safeParse(Object.fromEntries(event.url.searchParams));
	if (!parsed.success) return badRequest(formatZodError(parsed.error));

	const { status, course_id, search, page, limit } = parsed.data;
	const offset = (page - 1) * limit;

	const conditions: SQL[] = [];
	if (status) conditions.push(eq(subscribers.status, status));
	if (course_id) conditions.push(eq(subscribers.courseId, course_id));
	if (search) {
		const pattern = `%${search}%`;
		conditions.push(
			or(
				like(subscribers.firstName, pattern),
				like(subscribers.lastName, pattern),
				like(subscribers.email, pattern)
			) as SQL
		);
	}
	const where = conditions.length > 0 ? and(...conditions) : undefined;

	try {
		const [rows, [{ total }]] = await Promise.all([
			db.select().from(subscribers).where(where).limit(limit).offset(offset),
			db.select({ total: count() }).from(subscribers).where(where)
		]);
		return ok({ subscribers: rows, total, page, limit });
	} catch (err) {
		console.error('[subscribers] GET error:', err);
		return serverError();
	}
}

export async function POST(event: RequestEvent): Promise<Response> {
	let adminUser;
	try {
		adminUser = await event.locals.verifyStaffOrAdmin();
	} catch (err) {
		return authErrorResponse(err);
	}

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return badRequest('Invalid JSON body');
	}

	try {
		return created(await createSubscriber(body, adminUser));
	} catch (err) {
		if (err instanceof SubscriberServiceError && err.zodError) {
			return badRequest(formatZodError(err.zodError));
		}
		console.error('[subscribers] POST error:', err);
		return serverError();
	}
}
