import { describe, expect, it, vi } from 'vitest';
import { AuthError } from '$lib/services/auth';
import { AUTH_RATE_LIMIT_RETRY_AFTER_SECONDS, authErrorResponse, rawJson, withAuth } from './api';

describe('authErrorResponse', () => {
	it.each([
		['UNAUTHORIZED', 401],
		['FORBIDDEN', 403],
		['RATE_LIMITED', 429]
	] as const)('maps %s to HTTP %i', async (code, status) => {
		const response = authErrorResponse(new AuthError('Messaggio', code));
		expect(response.status).toBe(status);
		expect(await response.json()).toEqual({ success: false, error: 'Messaggio' });
	});

	it('adds Retry-After to rate limited responses', () => {
		const response = authErrorResponse(new AuthError('Troppi tentativi', 'RATE_LIMITED'));
		expect(response.headers.get('Retry-After')).toBe(String(AUTH_RATE_LIMIT_RETRY_AFTER_SECONDS));
	});

	it('falls back to a generic 500 for other errors', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const response = authErrorResponse(new Error('db password in stack'));
		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({ success: false, error: 'Internal Server Error' });
		consoleError.mockRestore();
	});
});

describe('withAuth', () => {
	it('returns the result of a successful check', async () => {
		await expect(withAuth(async () => ({ id: 1 }))).resolves.toEqual({ id: 1 });
	});

	it('returns the mapped response when the check fails', async () => {
		const result = await withAuth(() => {
			throw new AuthError('Admin access required', 'FORBIDDEN');
		});
		expect(result).toBeInstanceOf(Response);
		expect((result as Response).status).toBe(403);
	});
});

describe('rawJson', () => {
	it('serializes the body without the success envelope', async () => {
		const response = rawJson({ update_available: false });
		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('application/json');
		expect(await response.json()).toEqual({ update_available: false });
	});
});
