import type { RequestEvent } from '@sveltejs/kit';
import { eq, and, like, or, count, SQL } from 'drizzle-orm';
import { db } from '$lib/db';
import { subscribers, auditLog } from '$lib/db/schema';
import { subscribersQuerySchema, subscriberCreateSchema } from '$lib/utils/validation';
import { ok, created, badRequest, unauthorized, serverError, formatZodError } from '$lib/utils/api';
import { AuthError } from '$lib/services/auth';

export async function GET(event: RequestEvent): Promise<Response> {
	try {
		await event.locals.verifyAdmin();
	} catch (err) {
		return err instanceof AuthError ? unauthorized(err.message) : serverError();
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
		adminUser = await event.locals.verifyAdmin();
	} catch (err) {
		return err instanceof AuthError ? unauthorized(err.message) : serverError();
	}

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return badRequest('Invalid JSON body');
	}

	const parsed = subscriberCreateSchema.safeParse(body);
	if (!parsed.success) return badRequest(formatZodError(parsed.error));

	try {
		const result = await db.insert(subscribers).values({
			...parsed.data,
			purchaseDate: parsed.data.purchaseDate ? new Date(parsed.data.purchaseDate) : undefined,
			courseStartDate: parsed.data.courseStartDate
				? new Date(parsed.data.courseStartDate)
				: undefined,
			courseEndDate: parsed.data.courseEndDate ? new Date(parsed.data.courseEndDate) : undefined
		});

		const insertId = (result[0] as { insertId: number }).insertId;
		const [newRecord] = await db
			.select()
			.from(subscribers)
			.where(eq(subscribers.id, insertId))
			.limit(1);

		await db.insert(auditLog).values({
			userId: adminUser.id,
			action: 'subscriber_create',
			entityType: 'subscribers',
			entityId: newRecord.id,
			dataAfter: newRecord as unknown as Record<string, unknown>
		});

		return created(newRecord);
	} catch (err) {
		console.error('[subscribers] POST error:', err);
		return serverError();
	}
}
