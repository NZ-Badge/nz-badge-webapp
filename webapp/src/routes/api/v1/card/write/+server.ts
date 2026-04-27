import type { RequestEvent } from '@sveltejs/kit';
import { cardWriteSchema } from '$lib/utils/validation';
import { ok, badRequest, unauthorized, serverError, formatZodError } from '$lib/utils/api';
import { authorizeCardWrite } from '$lib/services/card-writer';
import { AuthError } from '$lib/services/auth';

export async function POST(event: RequestEvent): Promise<Response> {
	try {
		await event.locals.verifyAdmin();
	} catch (err) {
		return err instanceof AuthError ? unauthorized(err.message) : serverError();
	}

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return badRequest('Invalid JSON body');
	}

	const parsed = cardWriteSchema.safeParse(body);
	if (!parsed.success) return badRequest(formatZodError(parsed.error));

	try {
		const result = await authorizeCardWrite(parsed.data.subscriber_id);
		return ok(result);
	} catch (err) {
		console.error('[card/write] error:', err);
		return serverError(err instanceof Error ? err.message : undefined);
	}
}
