import type { RequestEvent } from '@sveltejs/kit';
import { z } from 'zod';
import {
	ok,
	badRequest,
	unauthorized,
	notFound,
	serverError,
	formatZodError
} from '$lib/utils/api';
import { authorizeCardErase } from '$lib/services/card-writer';
import { AuthError } from '$lib/services/auth';

const cardEraseSchema = z.object({
	card_id: z.number().int().positive()
});

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

	const parsed = cardEraseSchema.safeParse(body);
	if (!parsed.success) return badRequest(formatZodError(parsed.error));

	try {
		const result = await authorizeCardErase(parsed.data.card_id);
		return ok(result);
	} catch (err) {
		const msg = err instanceof Error ? err.message : 'Unknown error';
		if (msg.includes('not found')) return notFound(msg);
		if (msg.includes('non attiva') || msg.includes('Chiave')) return badRequest(msg);
		console.error('[card/erase] error:', err);
		return serverError();
	}
}
