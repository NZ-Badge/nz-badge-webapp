import type { RequestEvent } from '@sveltejs/kit';
import { z } from 'zod';
import { ok, badRequest, serverError, formatZodError, authErrorResponse } from '$lib/utils/api';
import { confirmCardErase } from '$lib/services/card-writer';

const schema = z.object({
	session_token: z.string().uuid()
});

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

	const parsed = schema.safeParse(body);
	if (!parsed.success) return badRequest(formatZodError(parsed.error));

	try {
		const result = await confirmCardErase(parsed.data.session_token, adminUser);
		return ok(result);
	} catch (err) {
		const msg = err instanceof Error ? err.message : 'Unknown error';
		if (msg.includes('token')) return badRequest(msg);
		console.error('[card/erase/confirm] error:', err);
		return serverError();
	}
}
