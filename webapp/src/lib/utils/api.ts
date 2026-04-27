import type { ZodError } from 'zod';

const JSON_CONTENT_TYPE = 'application/json';

function jsonResponse(body: string, status: number, extraHeaders?: Record<string, string>): Response {
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
	actions: Array<{ uid: string; action: 'confirm' | 'unknown' | 'ignored'; user_name?: string; ignored_reason?: string }>;
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

export function unauthorized(message = 'Unauthorized'): Response {
	return jsonResponse(JSON.stringify({ success: false, error: message }), 401);
}

export function forbidden(message = 'Forbidden'): Response {
	return jsonResponse(JSON.stringify({ success: false, error: message }), 403);
}

export function notFound(message = 'Not Found'): Response {
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

export function tooManyRequests(retryAfterSeconds: number): Response {
	return jsonResponse(JSON.stringify({ success: false, error: 'Too Many Requests' }), 429, {
		'Retry-After': String(retryAfterSeconds)
	});
}

// --- Server error responses ---

export function serverError(message = 'Internal Server Error'): Response {
	return jsonResponse(JSON.stringify({ success: false, error: message }), 500);
}

export function serviceUnavailable(message = 'Service Unavailable'): Response {
	return jsonResponse(JSON.stringify({ success: false, error: message }), 503);
}

// --- Utility ---

export function formatZodError(error: ZodError): string {
	return error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
}
