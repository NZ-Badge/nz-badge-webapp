import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	limit: vi.fn(async () => [] as unknown[]),
	logAudit: vi.fn(async () => undefined)
}));

vi.mock('$app/environment', () => ({ dev: true }));
vi.mock('$lib/db', () => ({
	db: { select: () => ({ from: () => ({ where: () => ({ limit: mocks.limit }) }) }) }
}));
vi.mock('$lib/services/audit', () => ({ logAudit: mocks.logAudit }));
vi.mock('$lib/services/auth', () => ({
	createAdminSession: vi.fn(async () => ({ token: 'token', expires: new Date() })),
	verifyUserSession: vi.fn()
}));

import bcrypt from 'bcryptjs';
import { actions } from './+page.server';

function event(email: string, ip = '10.0.0.1', password = 'wrong-password') {
	const body = new FormData();
	body.set('email', email);
	body.set('password', password);
	return {
		request: new Request('http://localhost/login?/login', { method: 'POST', body }),
		cookies: { set: vi.fn(), delete: vi.fn() },
		getClientAddress: () => ip
	} as unknown as Parameters<typeof actions.login>[0];
}

describe('login rate limiting', () => {
	beforeEach(() => vi.clearAllMocks());

	it('blocks an email after 5 failed attempts and audits the attempts', async () => {
		const email = 'Rate.Limited@example.com';
		for (let attempt = 0; attempt < 5; attempt++) {
			const result = await actions.login(event(email, `10.0.1.${attempt}`));
			expect(result).toMatchObject({ status: 400 });
		}
		const blocked = await actions.login(event(email.toLowerCase(), '10.0.2.1'));
		expect(blocked).toMatchObject({ status: 429 });
		expect(mocks.limit).toHaveBeenCalledTimes(5);
		expect(mocks.logAudit).toHaveBeenLastCalledWith(
			expect.objectContaining({ action: 'LOGIN_FAILED', ipAddress: '10.0.2.1' })
		);
	});

	it('does not count successful logins towards the IP limit', async () => {
		const passwordHash = await bcrypt.hash('right-password', 4);
		mocks.limit.mockResolvedValue([{ id: 1, status: 'active', passwordHash }]);
		for (let attempt = 0; attempt < 25; attempt++) {
			await expect(
				actions.login(event(`ok${attempt}@example.com`, '10.7.7.7', 'right-password'))
			).rejects.toMatchObject({ status: 303, location: '/dashboard' });
		}
		mocks.limit.mockResolvedValue([]);
		expect(await actions.login(event('other@example.com', '10.7.7.7'))).toMatchObject({
			status: 400
		});
	});

	it('blocks an IP after 20 failed attempts regardless of email', async () => {
		for (let attempt = 0; attempt < 20; attempt++) {
			await actions.login(event(`user${attempt}@example.com`, '10.9.9.9'));
		}
		const blocked = await actions.login(event('fresh@example.com', '10.9.9.9'));
		expect(blocked).toMatchObject({ status: 429 });
	});
});
