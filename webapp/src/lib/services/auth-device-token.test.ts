import { beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import type { DeviceReg } from '$lib/db/schema';

const state = vi.hoisted(() => ({
	device: undefined as Partial<DeviceReg> | undefined,
	updates: [] as Record<string, unknown>[],
	failUpdate: false
}));

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$lib/db', () => {
	const selectBuilder = {
		from: () => selectBuilder,
		where: () => selectBuilder,
		limit: async () => (state.device ? [state.device] : [])
	};
	return {
		db: {
			select: () => selectBuilder,
			update: () => ({
				set: (values: Record<string, unknown>) => ({
					where: () => {
						state.updates.push(values);
						return state.failUpdate ? Promise.reject(new Error('db down')) : Promise.resolve();
					}
				})
			})
		}
	};
});

import {
	AuthError,
	generateDeviceToken,
	hashDeviceToken,
	isLegacyBcryptHash,
	verifyDeviceToken,
	verifyDeviceTokenHash
} from './auth';

const TOKEN = 'a'.repeat(48);

function request(token = TOKEN, deviceId = 'reader-1') {
	return new Request('http://localhost/api/v1/attendance', {
		headers: { Authorization: `Bearer ${token}`, 'X-Device-ID': deviceId }
	});
}

async function flush() {
	await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
	state.device = undefined;
	state.updates = [];
	state.failUpdate = false;
});

describe('device token hashing', () => {
	it('hashes tokens as 64-char lowercase SHA-256 hex', () => {
		expect(hashDeviceToken('abc')).toBe(
			'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
		);
	});

	it('generates new tokens stored as SHA-256', async () => {
		const { token, hash } = await generateDeviceToken();
		expect(hash).toBe(hashDeviceToken(token));
		expect(isLegacyBcryptHash(hash)).toBe(false);
	});

	it('recognises bcrypt hash prefixes', () => {
		expect(isLegacyBcryptHash('$2a$10$abc')).toBe(true);
		expect(isLegacyBcryptHash('$2b$12$abc')).toBe(true);
		expect(isLegacyBcryptHash('$2y$10$abc')).toBe(true);
		expect(isLegacyBcryptHash(hashDeviceToken('x'))).toBe(false);
	});

	it('verifies SHA-256 hashes and rejects wrong tokens or malformed hashes', async () => {
		const hash = hashDeviceToken(TOKEN);
		await expect(verifyDeviceTokenHash(TOKEN, hash)).resolves.toEqual({
			valid: true,
			needsRehash: false
		});
		await expect(verifyDeviceTokenHash('wrong', hash)).resolves.toMatchObject({ valid: false });
		await expect(verifyDeviceTokenHash(TOKEN, 'not-a-hash')).resolves.toMatchObject({
			valid: false
		});
	});

	it('verifies legacy bcrypt hashes and flags them for rehash', async () => {
		const legacy = await bcrypt.hash(TOKEN, 4);
		await expect(verifyDeviceTokenHash(TOKEN, legacy)).resolves.toEqual({
			valid: true,
			needsRehash: true
		});
		await expect(verifyDeviceTokenHash('wrong', legacy)).resolves.toEqual({
			valid: false,
			needsRehash: false
		});
	});
});

describe('verifyDeviceToken', () => {
	it('accepts a SHA-256 token without rehashing', async () => {
		state.device = { deviceId: 'reader-1', active: true, tokenHash: hashDeviceToken(TOKEN) };
		await expect(verifyDeviceToken(request())).resolves.toMatchObject({ deviceId: 'reader-1' });
		await flush();
		expect(state.updates.some((u) => 'tokenHash' in u)).toBe(false);
	});

	it('accepts a legacy bcrypt token and rehashes it to SHA-256', async () => {
		state.device = {
			deviceId: 'reader-1',
			active: true,
			tokenHash: await bcrypt.hash(TOKEN, 4)
		};
		await expect(verifyDeviceToken(request())).resolves.toMatchObject({ deviceId: 'reader-1' });
		await flush();
		expect(state.updates).toContainEqual({ tokenHash: hashDeviceToken(TOKEN) });
	});

	it('logs but does not fail the request when the rehash update fails', async () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		state.failUpdate = true;
		state.device = {
			deviceId: 'reader-1',
			active: true,
			tokenHash: await bcrypt.hash(TOKEN, 4)
		};
		await expect(verifyDeviceToken(request())).resolves.toMatchObject({ deviceId: 'reader-1' });
		await flush();
		expect(errorSpy).toHaveBeenCalledWith(
			'[AUTH] Device token rehash failed:',
			'reader-1',
			expect.any(Error)
		);
		errorSpy.mockRestore();
	});

	it('rejects an invalid token', async () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		state.device = { deviceId: 'reader-2', active: true, tokenHash: hashDeviceToken(TOKEN) };
		await expect(verifyDeviceToken(request('wrong', 'reader-2'))).rejects.toBeInstanceOf(AuthError);
		warnSpy.mockRestore();
	});
});
