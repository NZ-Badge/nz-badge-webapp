import { beforeEach, describe, expect, it, vi } from 'vitest';

const execute = vi.hoisted(() => vi.fn());
vi.mock('$lib/db', () => ({ db: { execute } }));

import { healthCheckResponse } from './health';

describe('healthCheckResponse', () => {
	beforeEach(() => {
		execute.mockReset();
	});

	it('returns only the status when the database answers', async () => {
		execute.mockResolvedValue([]);
		const response = await healthCheckResponse();
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: 'ok' });
	});

	it('does not expose database error details', async () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		execute.mockImplementation(async () => {
			throw new Error('connect ECONNREFUSED 10.0.0.5:3306 user=secret');
		});
		const response = await healthCheckResponse();
		expect(response.status).toBe(503);
		const text = await response.text();
		expect(JSON.parse(text)).toEqual({ status: 'error' });
		expect(text).not.toContain('ECONNREFUSED');
		errorSpy.mockRestore();
	});
});
