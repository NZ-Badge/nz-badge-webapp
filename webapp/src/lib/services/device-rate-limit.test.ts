import { describe, expect, it } from 'vitest';
import { createDeviceRateLimiter } from '$lib/services/device-rate-limit';

describe('createDeviceRateLimiter', () => {
	it('allows up to maxRequests per window and rejects the next one', () => {
		const time = 1_000;
		const limiter = createDeviceRateLimiter(10, 1000, () => time);
		for (let i = 0; i < 10; i++) expect(limiter.isLimited('reader-1')).toBe(false);
		expect(limiter.isLimited('reader-1')).toBe(true);
	});

	it('tracks devices independently', () => {
		const limiter = createDeviceRateLimiter(1, 1000, () => 0);
		expect(limiter.isLimited('reader-1')).toBe(false);
		expect(limiter.isLimited('reader-2')).toBe(false);
		expect(limiter.isLimited('reader-1')).toBe(true);
	});

	it('forgets requests older than the rolling window', () => {
		let time = 0;
		const limiter = createDeviceRateLimiter(1, 1000, () => time);
		expect(limiter.isLimited('reader-1')).toBe(false);
		time = 999;
		expect(limiter.isLimited('reader-1')).toBe(true);
		time = 2000;
		expect(limiter.isLimited('reader-1')).toBe(false);
	});

	it('keeps separate counters per limiter instance', () => {
		const single = createDeviceRateLimiter(1, 1000, () => 0);
		const batch = createDeviceRateLimiter(1, 1000, () => 0);
		expect(single.isLimited('reader-1')).toBe(false);
		expect(batch.isLimited('reader-1')).toBe(false);
	});
});
