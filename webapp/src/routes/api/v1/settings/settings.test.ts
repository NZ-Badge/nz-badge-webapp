import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	setSettings: vi.fn(async (update: Record<string, unknown>) => Object.keys(update)),
	getSetting: vi.fn(async () => false),
	getSettingRows: vi.fn(async () => [] as unknown[]),
	getSettingsOverview: vi.fn(),
	countActiveCards: vi.fn(async () => 0),
	regenerateGlobalKeys: vi.fn(),
	logAudit: vi.fn()
}));

vi.mock('$lib/db', () => ({ db: {} }));
vi.mock('$lib/services/audit', () => ({ logAudit: mocks.logAudit }));
vi.mock('$lib/services/settings', () => ({
	setSettings: mocks.setSettings,
	getSetting: mocks.getSetting,
	getSettingRows: mocks.getSettingRows
}));
vi.mock('$lib/services/mifare-keys', () => ({
	getMifareKeyConfig: vi.fn(async () => ({
		useMifare: true,
		useSingleKey: true,
		keys: { keyA: 'A1A2A3A4A5A6', keyB: 'B1B2B3B4B5B6' }
	})),
	regenerateGlobalKeys: mocks.regenerateGlobalKeys
}));
vi.mock('$lib/services/settings-view', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/services/settings-view')>()),
	getSettingsOverview: mocks.getSettingsOverview,
	countActiveCards: mocks.countActiveCards
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
		expect(mocks.setSettings).not.toHaveBeenCalled();
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
		expect(mocks.setSettings).toHaveBeenCalledWith(
			{ enrollment_api_url: 'https://new.example.com' },
			{ userId: 1 }
		);
		const body = await response.json();
		expect(JSON.stringify(body)).not.toContain('A1A2A3A4A5A6');
	});

	it('treats an empty key as unchanged and null as an explicit removal', async () => {
		await PATCH(event({ role: 'admin', body: { enrollment_api_key: '' } }));
		expect(mocks.setSettings).toHaveBeenLastCalledWith({}, { userId: 1 });

		await PATCH(event({ role: 'admin', body: { enrollment_api_key: null } }));
		expect(mocks.setSettings).toHaveBeenLastCalledWith({ enrollment_api_key: '' }, { userId: 1 });
	});

	it('writes all changes in one call and audits them without secret values', async () => {
		await PATCH(
			event({
				role: 'admin',
				body: { use_mifare: true, min_swipe_interval_minutes: 5, enrollment_api_key: 'sk-new' }
			})
		);
		expect(mocks.setSettings).toHaveBeenCalledTimes(1);
		expect(mocks.setSettings).toHaveBeenCalledWith(
			{ use_mifare: true, min_swipe_interval_minutes: 5, enrollment_api_key: 'sk-new' },
			{ userId: 1 }
		);
		expect(mocks.logAudit).toHaveBeenCalledWith(
			expect.objectContaining({ action: 'SETTINGS_UPDATE', entityType: 'setting' })
		);
		expect(JSON.stringify(mocks.logAudit.mock.calls)).not.toContain('sk-new');
	});

	it('refuses single-key mode while cards are active, before writing anything', async () => {
		mocks.countActiveCards.mockResolvedValueOnce(3);
		const response = await PATCH(
			event({ role: 'admin', body: { use_single_mifare_key: true, regenerate_mifare_keys: true } })
		);
		expect(response.status).toBe(409);
		expect(mocks.setSettings).not.toHaveBeenCalled();
		expect(mocks.regenerateGlobalKeys).not.toHaveBeenCalled();
	});
});
