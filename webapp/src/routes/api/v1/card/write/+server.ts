import type { RequestEvent } from '@sveltejs/kit';
import { cardWriteSchema } from '$lib/utils/validation';
import { ok, badRequest, unauthorized, serverError, formatZodError } from '$lib/utils/api';
import { authorizeCardWrite, authorizeUserCardWrite } from '$lib/services/card-writer';
import { AuthError, requireStaffManager } from '$lib/services/auth';

export async function POST(event: RequestEvent): Promise<Response> {
	try {
		const user = await event.locals.verifyAdmin();
		requireStaffManager(user);
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
		const result = parsed.data.user_id
			? await authorizeUserCardWrite(parsed.data.user_id)
			: await authorizeCardWrite(parsed.data.subscriber_id!);
		return ok(result);
	} catch (err) {
		console.error('[card/write] error:', err);
		return serverError(err instanceof Error ? err.message : undefined);
	}
}
