import type { Handle, HandleServerError, RequestEvent } from '@sveltejs/kit';
import { error, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { User } from '$lib/db/schema';
import {
	AuthError,
	assertRole,
	canAccessAppPath,
	STAFF_ROLES,
	verifyDeviceToken,
	verifyUserSession
} from '$lib/services/auth';
import { generateCspNonce, generateSecurityHeaders } from '$lib/utils/security';
import {
	createLogger,
	generateRequestId,
	runWithRequestId,
	sanitizeLogText
} from '$lib/server/logger';
import { dev } from '$app/environment';

const log = createLogger('http');

function getCanonicalOrigin(): string | null {
	const value = env.PRIMARY_APP_ORIGIN?.trim();
	return value ? value.replace(/\/+$/, '') : null;
}

function getLegacyHosts(): Set<string> {
	return new Set(
		(env.LEGACY_APP_HOSTS ?? '')
			.split(',')
			.map((host) => host.trim().toLowerCase())
			.filter(Boolean)
	);
}

/**
 * Server hook - Security hardening for healthcare environment
 * Implements CSP, security headers, and secure error handling
 */
export const handle: Handle = async ({ event, resolve }) => {
	// Correlate every log line emitted while serving this request.
	const requestId = generateRequestId();
	event.locals.requestId = requestId;
	return runWithRequestId(requestId, () => handleRequest(event, resolve));
};

async function handleRequest(
	event: Parameters<Handle>[0]['event'],
	resolve: Parameters<Handle>[0]['resolve']
): Promise<Response> {
	const canonicalOrigin = getCanonicalOrigin();
	const legacyHosts = getLegacyHosts();

	if (
		!dev &&
		canonicalOrigin &&
		legacyHosts.has(event.url.hostname.toLowerCase()) &&
		(event.request.method === 'GET' || event.request.method === 'HEAD') &&
		!event.url.pathname.startsWith('/api/')
	) {
		const canonicalUrl = new URL(event.url.pathname + event.url.search, canonicalOrigin);
		throw redirect(308, canonicalUrl.toString());
	}

	// Generate CSP nonce for this request
	const cspNonce = generateCspNonce();
	event.locals.cspNonce = cspNonce;

	// Attach auth helpers to locals. The session lookup is memoized per request so that
	// the hook, layout, page load and action checks hit the database only once.
	let sessionUser: Promise<User> | undefined;
	const verifyUser = () => (sessionUser ??= verifyUserSession(event.cookies));
	const verifyStaffOrAdmin = async () => assertRole(await verifyUser(), STAFF_ROLES);
	event.locals.verifyDevice = () => verifyDeviceToken(event.request);
	event.locals.verifyUser = verifyUser;
	event.locals.verifyStaffOrAdmin = verifyStaffOrAdmin;
	event.locals.verifyAdminOnly = async () => assertRole(await verifyUser(), ['admin']);

	// Deny by default for the (app) group; routes still perform their own role checks.
	if (event.route.id?.startsWith('/(app)')) {
		await enforceAppAccess(event);
	}

	// Process the request
	const response = await resolve(event, {
		transformPageChunk: ({ html }) => {
			// Inject CSP nonce into script tags
			return html.replace(/<script/g, `<script nonce="${cspNonce}"`);
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
	response.headers.set('X-Request-ID', event.locals.requestId);

	return response;
}

/**
 * Require a valid session for every route in the (app) group and apply the
 * Collaborator allowlist. Full HTML renders are left to the (app) layout for the
 * 403 so that the styled error page is shown; data and action requests can skip
 * the layout load, so they are rejected here.
 */
async function enforceAppAccess(event: RequestEvent): Promise<void> {
	let user: User;
	try {
		user = await event.locals.verifyUser();
	} catch (err) {
		if (!(err instanceof AuthError)) throw err;
		// Plain JSON clients of (app) +server endpoints get a 401; pages, data requests and
		// form actions (also with use:enhance) are redirected to the login page.
		const accept = event.request.headers.get('accept') ?? '';
		const isActionRequest = event.request.headers.get('x-sveltekit-action') === 'true';
		if (
			!event.isDataRequest &&
			!isActionRequest &&
			accept.includes('application/json') &&
			!accept.includes('text/html')
		) {
			error(401, 'Sessione non valida o scaduta');
		}
		redirect(303, '/login');
	}

	const isFullPageRender =
		!event.isDataRequest && (event.request.method === 'GET' || event.request.method === 'HEAD');
	if (!isFullPageRender && !canAccessAppPath(user.role, event.url.pathname)) {
		error(403, 'Accesso non consentito');
	}
}

/**
 * Error handler - Secure logging for healthcare compliance
 * Logs errors without exposing sensitive information
 */
export const handleError: HandleServerError = async ({ error, event, status, message }) => {
	const fields = {
		status,
		method: event.request.method,
		// Query strings may carry personal data (for example an email filter): log the path only.
		path: event.url.pathname,
		requestId: event.locals.requestId
	};

	if (status >= 500) {
		log.error(sanitizeLogText(message), {
			...fields,
			type: 'fatal_error',
			error: error instanceof Error ? error : String(error)
		});
	} else if (status >= 400) {
		log.warn(sanitizeLogText(message), { ...fields, type: 'client_error' });
	}

	// Return safe error message to client
	// Don't expose internal error details
	return {
		message: status >= 500 ? 'Errore interno del server' : message
	};
};
