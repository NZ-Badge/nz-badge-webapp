import type { Handle, HandleServerError } from '@sveltejs/kit';
import { verifyDeviceToken, verifyAdminSession } from '$lib/services/auth';
import { generateCspNonce, generateSecurityHeaders } from '$lib/utils/security';
import { dev } from '$app/environment';

/**
 * Server hook - Security hardening for healthcare environment
 * Implements CSP, security headers, and secure error handling
 */
export const handle: Handle = async ({ event, resolve }) => {
	// Generate CSP nonce for this request
	const cspNonce = generateCspNonce();
	event.locals.cspNonce = cspNonce;

	// Attach auth helpers to locals without enforcing auth globally.
	// Individual routes perform their own auth checks.
	event.locals.verifyDevice = () => verifyDeviceToken(event.request);
	event.locals.verifyAdmin = () => verifyAdminSession(event.cookies);

	// Process the request
	const response = await resolve(event, {
		transformPageChunk: ({ html }) => {
			// Inject CSP nonce into script tags
			return html.replace(
				/<script/g,
				`<script nonce="${cspNonce}"`
			);
		}
	});

	// Add security headers (skip in dev for easier debugging)
	if (!dev) {
		const securityHeaders = generateSecurityHeaders(cspNonce);
		for (const [header, value] of Object.entries(securityHeaders)) {
			// Don't override if already set
			if (!response.headers.has(header)) {
				response.headers.set(header, value);
			}
		}
	} else {
		// In dev, only set basic security headers
		response.headers.set('X-Content-Type-Options', 'nosniff');
		response.headers.set('X-Frame-Options', 'DENY');
	}

	// Remove server identification headers
	response.headers.delete('X-Powered-By');
	response.headers.delete('Server');

	return response;
};

/**
 * Error handler - Secure logging for healthcare compliance
 * Logs errors without exposing sensitive information
 */
export const handleError: HandleServerError = async ({ error, event, status, message }) => {
	const timestamp = new Date().toISOString();
	const url = event.url.pathname + event.url.search;

	// Sanitize error message for logging (remove PII)
	const sanitizeErrorMessage = (msg: string): string => {
		return msg
			.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
			.replace(/\b(?:\d{3}-?){2}\d{4}\b/g, '[SSN]')
			.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CARD]');
	};

	// Log fatal errors (5xx) to console for monitoring systems
	if (status >= 500) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		const errorStack = error instanceof Error ? error.stack : undefined;

		// Log structured error to stdout/stderr for log aggregation
		console.error(JSON.stringify({
			level: 'error',
			timestamp,
			status,
			url,
			method: event.request.method,
			message: sanitizeErrorMessage(message),
			error: sanitizeErrorMessage(errorMessage),
			stack: errorStack ? sanitizeErrorMessage(errorStack) : undefined,
			type: 'fatal_error',
			requestId: crypto.randomUUID?.() || generateRequestId()
		}));
	}

	// For 4xx errors, log at warning level
	if (status >= 400 && status < 500) {
		console.warn(JSON.stringify({
			level: 'warn',
			timestamp,
			status,
			url,
			method: event.request.method,
			message: sanitizeErrorMessage(message),
			type: 'client_error',
			requestId: crypto.randomUUID?.() || generateRequestId()
		}));
	}

	// Return safe error message to client
	// Don't expose internal error details
	return {
		message: status >= 500 ? 'Internal Server Error' : message
	};
};

/**
 * Generate simple request ID for tracking
 */
function generateRequestId(): string {
	return Array.from({ length: 16 }, () =>
		Math.floor(Math.random() * 16).toString(16)
	).join('');
}

// Type augmentation for locals
declare global {
	namespace App {
		interface Locals {
			verifyDevice: () => ReturnType<typeof verifyDeviceToken>;
			verifyAdmin: () => ReturnType<typeof verifyAdminSession>;
			cspNonce: string;
		}
	}
}
