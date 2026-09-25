import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '$lib/db/schema';

const env = vi.hoisted(() => ({ JWT_SECRET: '' as string | undefined }));
vi.mock('$env/dynamic/private', () => ({ env }));
vi.mock('$lib/db', () => ({ db: {} }));

import {
	AuthError,
	canAccessAppPath,
	createAdminSession,
	getJwtSecretKey,
	requirePageAdmin,
	requirePageStaff,
	requirePageUser
} from './auth';

function locals(result: Partial<User> | AuthError) {
	return {
		verifyUser: vi.fn(async () => {
			if (result instanceof AuthError) throw result;
			return { id: 1, ...result } as User;
		})
	};
}

describe('page guards', () => {
	it('redirects to /login without a valid session', async () => {
		const unauthenticated = locals(new AuthError('No session cookie', 'UNAUTHORIZED'));
		for (const guard of [requirePageUser, requirePageStaff, requirePageAdmin]) {
			await expect(guard(unauthenticated)).rejects.toMatchObject({
				status: 303,
				location: '/login'
			});
		}
	});

	it('rejects collaborators from staff routes and staff from admin routes', async () => {
		await expect(requirePageUser(locals({ role: 'collaborator' }))).resolves.toMatchObject({
			role: 'collaborator'
		});
		await expect(requirePageStaff(locals({ role: 'collaborator' }))).rejects.toMatchObject({
			status: 403
		});
		await expect(requirePageStaff(locals({ role: 'staff' }))).resolves.toMatchObject({
			role: 'staff'
		});
		await expect(requirePageAdmin(locals({ role: 'staff' }))).rejects.toMatchObject({
			status: 403
		});
		await expect(requirePageAdmin(locals({ role: 'admin' }))).resolves.toMatchObject({
			role: 'admin'
		});
	});

	it('does not swallow unexpected errors', async () => {
		const broken = { verifyUser: vi.fn(async () => Promise.reject(new Error('db down'))) };
		await expect(requirePageUser(broken)).rejects.toThrow('db down');
	});
});

describe('canAccessAppPath', () => {
	it('limits collaborators to the allowlisted sections', () => {
		expect(canAccessAppPath('collaborator', '/dashboard')).toBe(true);
		expect(canAccessAppPath('collaborator', '/new-students')).toBe(true);
		expect(canAccessAppPath('collaborator', '/today/extra')).toBe(true);
		expect(canAccessAppPath('collaborator', '/subscribers')).toBe(false);
		expect(canAccessAppPath('collaborator', '/todayfake')).toBe(false);
		expect(canAccessAppPath('staff', '/subscribers')).toBe(true);
		expect(canAccessAppPath(null, '/dashboard')).toBe(false);
	});
});

describe('JWT secret', () => {
	beforeEach(() => {
		env.JWT_SECRET = '';
	});

	it('fails fast when JWT_SECRET is missing or shorter than 32 characters', async () => {
		env.JWT_SECRET = undefined;
		expect(() => getJwtSecretKey()).toThrow(/JWT_SECRET/);
		env.JWT_SECRET = 'short-secret';
		expect(() => getJwtSecretKey()).toThrow(/32/);
		await expect(
			createAdminSession({ id: 1, email: 'a@b.it', role: 'admin' } as User)
		).rejects.toThrow(/JWT_SECRET/);
	});

	it('accepts a secret of at least 32 characters', () => {
		env.JWT_SECRET = 'x'.repeat(32);
		expect(getJwtSecretKey()).toHaveLength(32);
	});
});
