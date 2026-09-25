import { describe, expect, it, vi } from 'vitest';
import { ApiError, apiAction, apiFetch, errorMessage } from './http';

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

describe('apiFetch', () => {
	it('returns data from the success envelope', async () => {
		const fetchFn = vi.fn(async () => jsonResponse({ success: true, data: { id: 1 } }));
		await expect(apiFetch<{ id: number }>('/api/x', { fetch: fetchFn })).resolves.toEqual({
			id: 1
		});
	});

	it('serialises plain objects as JSON', async () => {
		const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse({ success: true, data: null }));
		await apiFetch('/api/x', { method: 'PATCH', body: { a: 1 }, fetch: fetchFn });
		const init = fetchFn.mock.calls[0][1]!;
		expect(init.body).toBe('{"a":1}');
		expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
	});

	it('throws ApiError with the server message and status', async () => {
		const fetchFn = vi.fn(async () =>
			jsonResponse({ success: false, error: 'Email già esistente' }, 409)
		);
		const error = await apiFetch<never>('/api/x', { fetch: fetchFn }).catch(
			(e: unknown) => e as ApiError
		);
		expect(error).toBeInstanceOf(ApiError);
		expect(error.status).toBe(409);
		expect(error.message).toBe('Email già esistente');
	});

	it('uses a generic message when the body is not JSON', async () => {
		const fetchFn = vi.fn(async () => new Response('boom', { status: 502 }));
		const error = await apiFetch<never>('/api/x', { fetch: fetchFn }).catch(
			(e: unknown) => e as ApiError
		);
		expect(error).toBeInstanceOf(ApiError);
		expect(error.message).toBe('Errore del server (502)');
	});

	it('wraps network failures', async () => {
		const fetchFn = vi.fn(async () => {
			throw new TypeError('Failed to fetch');
		});
		const error = await apiFetch<never>('/api/x', { fetch: fetchFn }).catch(
			(e: unknown) => e as ApiError
		);
		expect(error).toBeInstanceOf(ApiError);
		expect(error.status).toBe(0);
	});
});

describe('errorMessage', () => {
	it('falls back for unknown values', () => {
		expect(errorMessage('x', 'Fallback')).toBe('Fallback');
		expect(errorMessage(new Error('Messaggio'))).toBe('Messaggio');
	});
});

describe('apiAction', () => {
	it('maps API errors to an action failure with field errors', async () => {
		const fetchFn = vi.fn(async () =>
			jsonResponse(
				{ success: false, error: 'Validazione fallita', details: { email: ['Email non valida'] } },
				400
			)
		);
		const result = await apiAction('/api/x', { fetch: fetchFn });
		expect(result.ok).toBe(false);
		expect(result.failure?.status).toBe(400);
		expect(result.failure?.data).toEqual({
			message: 'Validazione fallita',
			errors: { email: 'Email non valida' }
		});
	});

	it('returns data on success', async () => {
		const fetchFn = vi.fn(async () => jsonResponse({ success: true, data: { ok: 1 } }));
		await expect(apiAction('/api/x', { fetch: fetchFn })).resolves.toEqual({
			ok: true,
			data: { ok: 1 }
		});
	});
});
