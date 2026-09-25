import { afterEach, describe, expect, it, vi } from 'vitest';
import { eraseCardFlow, validateCardWrite, type CardEraser } from './card-client';

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

function mockFetch(...responses: Response[]) {
	const fn = vi.fn(async () => responses.shift() ?? json({ success: false }, 500));
	vi.stubGlobal('fetch', fn);
	return fn;
}

const authorization = () =>
	json({
		success: true,
		data: { session_token: 'tok', erase_data: { sector: 4, key_a: 'AABBCCDDEEFF' } }
	});

afterEach(() => vi.unstubAllGlobals());

describe('eraseCardFlow', () => {
	it('authorizes, erases and confirms', async () => {
		const fetchFn = mockFetch(authorization(), json({ success: true, data: {} }));
		const writer: CardEraser = {
			eraseCard: vi.fn(async () => ({ status: 'success' as const, message: 'ok' })),
			forceEraseCard: vi.fn()
		};

		await eraseCardFlow(writer, 7);

		expect(writer.eraseCard).toHaveBeenCalledWith({ sector: 4, key_a: 'AABBCCDDEEFF' });
		expect(writer.forceEraseCard).not.toHaveBeenCalled();
		expect(fetchFn.mock.calls.map((call) => (call as unknown[])[0])).toEqual([
			'/api/v1/card/7/erase',
			'/api/v1/card/7/erase/confirm'
		]);
		const confirmInit = (fetchFn.mock.calls[1] as unknown[])[1] as RequestInit;
		expect(JSON.parse(String(confirmInit.body))).toEqual({ session_token: 'tok' });
	});

	it('retries with force erase when MIFARE authentication fails', async () => {
		mockFetch(authorization(), json({ success: true, data: {} }));
		const writer: CardEraser = {
			eraseCard: vi.fn(async () => ({
				status: 'error' as const,
				message: 'Authentication failed'
			})),
			forceEraseCard: vi.fn(async () => ({ status: 'success' as const, message: 'ok' }))
		};

		await eraseCardFlow(writer, 7);
		expect(writer.forceEraseCard).toHaveBeenCalledWith({ sector: 4 });
	});

	it('does not confirm when the hardware erase fails', async () => {
		const fetchFn = mockFetch(authorization());
		const writer: CardEraser = {
			eraseCard: vi.fn(async () => ({ status: 'timeout' as const, message: 'Timeout' })),
			forceEraseCard: vi.fn()
		};

		await expect(eraseCardFlow(writer, 7)).rejects.toThrow('Timeout');
		expect(writer.forceEraseCard).not.toHaveBeenCalled();
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});

	it('surfaces the server error of the authorization step', async () => {
		mockFetch(json({ success: false, error: 'Card non trovata' }, 404));
		const writer: CardEraser = { eraseCard: vi.fn(), forceEraseCard: vi.fn() };
		await expect(eraseCardFlow(writer, 7)).rejects.toThrow('Card non trovata');
		expect(writer.eraseCard).not.toHaveBeenCalled();
	});
});

describe('validateCardWrite', () => {
	it('maps 409 UID conflicts to a result', async () => {
		mockFetch(
			json(
				{ success: false, error: 'UID in storico', details: { code: 'UID_IN_DELETED_HISTORY' } },
				409
			)
		);
		await expect(validateCardWrite('tok', 'AA')).resolves.toEqual({
			ok: false,
			conflict: 'UID_IN_DELETED_HISTORY'
		});
	});

	it('throws other errors', async () => {
		mockFetch(json({ success: false, error: 'Sessione scaduta' }, 400));
		await expect(validateCardWrite('tok', 'AA')).rejects.toThrow('Sessione scaduta');
	});
});
