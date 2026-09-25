import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const limit = vi.fn();
	const where = vi.fn(() => ({ limit }));
	const from = vi.fn(() => ({ where }));
	const select = vi.fn(() => ({ from }));
	const update = vi.fn();
	const insert = vi.fn();
	return { limit, select, update, insert, logAudit: vi.fn() };
});

vi.mock('$lib/db', () => ({
	db: { select: mocks.select, update: mocks.update, insert: mocks.insert }
}));
vi.mock('$lib/services/audit', () => ({ logAudit: mocks.logAudit }));
vi.mock('$lib/services/auth', () => ({ hashPassword: vi.fn(async () => 'hash') }));

import { createUser, deactivateUser, updateUser, UserServiceError } from './users';

const admin = { id: 1, role: 'admin' as const };

async function serviceError(promise: Promise<unknown>): Promise<UserServiceError> {
	const err = await promise.then(
		() => null,
		(e: unknown) => e
	);
	expect(err).toBeInstanceOf(UserServiceError);
	return err as UserServiceError;
}

describe('users service', () => {
	beforeEach(() => vi.clearAllMocks());

	it('rejects invalid input with per-field messages and no writes', async () => {
		const err = await serviceError(
			createUser({ name: '', email: 'x', role: 'admin', password: 'short' }, admin)
		);
		expect(err.status).toBe(400);
		expect(Object.keys(err.fieldErrors ?? {})).toEqual(
			expect.arrayContaining(['name', 'email', 'password'])
		);
		expect(mocks.insert).not.toHaveBeenCalled();
	});

	it('refuses to change the actor’s own role', async () => {
		mocks.limit.mockResolvedValueOnce([{ id: 1, role: 'admin', status: 'active' }]);
		const err = await serviceError(updateUser({ id: 1, role: 'staff' }, admin));
		expect(err.status).toBe(403);
		expect(mocks.update).not.toHaveBeenCalled();
	});

	it('refuses to deactivate the actor’s own account', async () => {
		const err = await serviceError(deactivateUser(1, admin));
		expect(err.status).toBe(403);
		expect(mocks.select).not.toHaveBeenCalled();
	});

	it('rejects an invalid id', async () => {
		const err = await serviceError(deactivateUser(Number('abc'), admin));
		expect(err.status).toBe(400);
	});
});
