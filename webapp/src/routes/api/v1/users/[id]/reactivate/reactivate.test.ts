import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const limit = vi.fn();
	const selectWhere = vi.fn(() => ({ limit }));
	const from = vi.fn(() => ({ where: selectWhere }));
	const select = vi.fn(() => ({ from }));
	const updateWhere = vi.fn();
	const set = vi.fn(() => ({ where: updateWhere }));
	const update = vi.fn(() => ({ set }));
	const logAudit = vi.fn();

	return { limit, select, update, set, updateWhere, logAudit };
});

vi.mock('$lib/db', () => ({
	db: {
		select: mocks.select,
		update: mocks.update
	}
}));

vi.mock('$lib/services/audit', () => ({ logAudit: mocks.logAudit }));

vi.mock('$lib/services/auth', () => {
	class AuthError extends Error {
		constructor(
			message: string,
			public readonly code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'RATE_LIMITED'
		) {
			super(message);
		}
	}

	return {
		AuthError,
		requireAdmin: vi.fn()
	};
});

import { POST } from './+server';

const admin = { id: 1, role: 'admin' };

function eventFor(id: string) {
	return {
		params: { id },
		locals: { verifyStaffOrAdmin: vi.fn().mockResolvedValue(admin) }
	} as unknown as Parameters<typeof POST>[0];
}

describe('POST /api/v1/users/:id/reactivate', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('reactivates a deleted user without restoring their cards', async () => {
		const deletedUser = {
			id: 7,
			name: 'Mario Rossi',
			email: 'mario@example.test',
			passwordHash: 'secret-hash',
			role: 'staff',
			status: 'deleted',
			deletedAt: new Date('2026-09-01T10:00:00Z')
		};
		const activeUser = { ...deletedUser, status: 'active', deletedAt: null };
		mocks.limit.mockResolvedValueOnce([deletedUser]).mockResolvedValueOnce([activeUser]);

		const response = await POST(eventFor('7'));
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(mocks.set).toHaveBeenCalledWith({ status: 'active', deletedAt: null });
		expect(mocks.logAudit).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 1,
				action: 'UPDATE',
				entityType: 'user',
				entityId: 7
			})
		);
		expect(body.user).toMatchObject({ id: 7, status: 'active', deletedAt: null });
		expect(body.user).not.toHaveProperty('passwordHash');
	});

	it('rejects an account that is already active', async () => {
		mocks.limit.mockResolvedValueOnce([{ id: 7, status: 'active' }]);

		const response = await POST(eventFor('7'));

		expect(response.status).toBe(409);
		expect(mocks.update).not.toHaveBeenCalled();
	});

	it('rejects an invalid user id', async () => {
		const response = await POST(eventFor('not-a-number'));

		expect(response.status).toBe(400);
		expect(mocks.select).not.toHaveBeenCalled();
	});
});
