import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const where = vi.fn(async () => undefined);
	const set = vi.fn(() => ({ where }));
	const from = vi.fn(async () => [] as unknown[]);
	return {
		db: { update: vi.fn(() => ({ set })), select: vi.fn(() => ({ from })) },
		setEnrollmentApiConfig: vi.fn(async () => undefined),
		getSettingsOverview: vi.fn()
	};
});

vi.mock('$lib/db', () => ({ db: mocks.db }));
vi.mock('$lib/services/enrollments', () => ({
	setEnrollmentApiConfig: mocks.setEnrollmentApiConfig
}));
vi.mock('$lib/services/mifare-keys', () => ({
	getMifareKeyConfig: vi.fn(async () => ({
		useMifare: true,
		useSingleKey: true,
		keys: { keyA: 'A1A2A3A4A5A6', keyB: 'B1B2B3B4B5B6' }
	})),
	regenerateGlobalKeys: vi.fn(),
	setSingleKeyMode: vi.fn(),
	isSingleKeyModeEnabled: vi.fn()
}));
vi.mock('$lib/services/settings-view', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/services/settings-view')>()),
	getSettingsOverview: mocks.getSettingsOverview,
	countActiveCards: vi.fn(async () => 0)
}));

import { AuthError } from '$lib/services/auth';
import { GET, PATCH } from './+server';

function event(options: { role?: 'admin' | 'staff'; body?: unknown } = {}) {
	const verifyAdminOnly = vi.fn(async () => {
		if (options.role !== 'admin') throw new AuthError('Insufficient permissions', 'FORBIDDEN');
		return { id: 1, role: 'admin' };
	});
	return {
		locals: { verifyAdminOnly },
		request: new Request('http://localhost/api/v1/settings', {
			method: options.body === undefined ? 'GET' : 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: options.body === undefined ? undefined : JSON.stringify(options.body)
		})
	} as unknown as Parameters<typeof GET>[0];
}

describe('settings API', () => {
	beforeEach(() => vi.clearAllMocks());

	it('rejects staff on GET and PATCH with 403', async () => {
		expect((await GET(event({ role: 'staff' }))).status).toBe(403);
		expect((await PATCH(event({ role: 'staff', body: { use_mifare: true } }))).status).toBe(403);
		expect(mocks.db.update).not.toHaveBeenCalled();
	});

	it('returns only has_* flags for secrets on GET', async () => {
		mocks.getSettingsOverview.mockResolvedValue({
			settings: [],
			values: {},
			mifareKeys: { useMifare: true, useSingleKey: true, hasKeys: true },
			activeCardsCount: 0,
			enrollmentApi: { url: 'https://api.example.com', hasKey: true },
			webhook: { hasSecret: false }
		});
		const body = await (await GET(event({ role: 'admin' }))).json();
		expect(body.data.enrollment_api).toEqual({ url: 'https://api.example.com', has_key: true });
		expect(body.data.webhook).toEqual({ has_secret: false });
		expect(body.data.mifare_keys).toEqual({ useMifare: true, useSingleKey: true, hasKeys: true });
	});

	it('does not wipe the API key when only the URL is sent', async () => {
		const response = await PATCH(
			event({ role: 'admin', body: { enrollment_api_url: 'https://new.example.com' } })
		);
		expect(response.status).toBe(200);
		expect(mocks.setEnrollmentApiConfig).toHaveBeenCalledWith({
			url: 'https://new.example.com',
			key: undefined
		});
		const body = await response.json();
		expect(JSON.stringify(body)).not.toContain('A1A2A3A4A5A6');
	});

	it('treats an empty key as unchanged and null as an explicit removal', async () => {
		await PATCH(event({ role: 'admin', body: { enrollment_api_key: '' } }));
		expect(mocks.setEnrollmentApiConfig).not.toHaveBeenCalled();

		await PATCH(event({ role: 'admin', body: { enrollment_api_key: null } }));
		expect(mocks.setEnrollmentApiConfig).toHaveBeenCalledWith({ url: undefined, key: null });
	});
});
