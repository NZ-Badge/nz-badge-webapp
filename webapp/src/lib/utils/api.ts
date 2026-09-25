import type { ZodError } from 'zod';
import type { AttendanceAction } from '$lib/services/attendance';
import { AuthError } from '$lib/services/auth';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api');

const JSON_CONTENT_TYPE = 'application/json';

function jsonResponse(
	body: string,
	status: number,
	extraHeaders?: Record<string, string>
): Response {
	const bytes = Buffer.byteLength(body, 'utf8');
	return new Response(body, {
		status,
		headers: {
			'Content-Type': JSON_CONTENT_TYPE,
			'Content-Length': String(bytes),
			...extraHeaders
		}
	});
}

// --- Success responses ---

/**
 * JSON senza l'involucro `{ success, data }`: solo per i contratti che lo richiedono
 * (per esempio le risposte documentate in docs/DEVICE-API.md).
 */
export function rawJson(body: unknown, status = 200): Response {
	return jsonResponse(JSON.stringify(body), status);
}

export function ok<T>(data: T): Response {
	return jsonResponse(JSON.stringify({ success: true, data }), 200);
}

export function created<T>(data: T): Response {
	return jsonResponse(JSON.stringify({ success: true, data }), 201);
}

export function multiStatus(response: {
	accepted: number;
	rejected: number;
	server_time: string;
	results: Array<{ index: number; status: number; reason?: string }>;
	actions: AttendanceAction[];
}): Response {
	return jsonResponse(JSON.stringify({ success: true, ...response }), 207);
}

// --- Client error responses ---

export function badRequest(message: string, errors?: unknown): Response {
	const body: { success: false; error: string; details?: unknown } = {
		success: false,
		error: message
	};
	if (errors !== undefined) {
		body.details = errors;
	}
	return jsonResponse(JSON.stringify(body), 400);
}

export function unauthorized(message = 'Non autorizzato'): Response {
	return jsonResponse(JSON.stringify({ success: false, error: message }), 401);
}

export function forbidden(message = 'Accesso non consentito'): Response {
	return jsonResponse(JSON.stringify({ success: false, error: message }), 403);
}

export function notFound(message = 'Risorsa non trovata'): Response {
	return jsonResponse(JSON.stringify({ success: false, error: message }), 404);
}

export function conflict(message: string, details?: unknown): Response {
	const body: { success: false; error: string; details?: unknown } = {
		success: false,
		error: message
	};
	if (details !== undefined) {
		body.details = details;
	}
	return jsonResponse(JSON.stringify(body), 409);
}

export function payloadTooLarge(message: string): Response {
	return jsonResponse(JSON.stringify({ success: false, error: message }), 413);
}

export function tooManyRequests(retryAfterSeconds: number, message = 'Troppe richieste'): Response {
	return jsonResponse(JSON.stringify({ success: false, error: message }), 429, {
		'Retry-After': String(retryAfterSeconds)
	});
}

// --- Server error responses ---

export function serverError(message = 'Errore interno del server'): Response {
	return jsonResponse(JSON.stringify({ success: false, error: message }), 500);
}

// --- Auth ---

/** Retry-After (secondi) suggerito quando scatta il rate limit dell'autenticazione device. */
export const AUTH_RATE_LIMIT_RETRY_AFTER_SECONDS = 60;

/**
 * Traduce un errore di autenticazione in risposta HTTP:
 * UNAUTHORIZED → 401, FORBIDDEN → 403, RATE_LIMITED → 429. Ogni altro errore → 500.
 */
export function authErrorResponse(err: unknown): Response {
	if (err instanceof AuthError) {
		switch (err.code) {
			case 'UNAUTHORIZED':
				return unauthorized(err.message);
			case 'FORBIDDEN':
				return forbidden(err.message);
			case 'RATE_LIMITED':
				return tooManyRequests(AUTH_RATE_LIMIT_RETRY_AFTER_SECONDS, err.message);
		}
	}
	log.error('Unexpected error during authentication', { err });
	return serverError();
}

/**
 * Esegue i controlli di autenticazione e restituisce il loro risultato, oppure la risposta
 * di errore corrispondente. Uso tipico:
 *
 *     const auth = await withAuth(() => locals.verifyStaffOrAdmin());
 *     if (auth instanceof Response) return auth;
 */
export async function withAuth<T>(check: () => T | Promise<T>): Promise<T | Response> {
	try {
		return await check();
	} catch (err) {
		return authErrorResponse(err);
	}
}

// --- Utility ---

/** Marks a response as non-cacheable (`Cache-Control: no-store`) and returns it. */
export function noStore(response: Response): Response {
	response.headers.set('Cache-Control', 'no-store');
	return response;
}

export function formatZodError(error: ZodError): string {
	return error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
}
