import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const mocks = vi.hoisted(() => ({
	getWebhookSecret: vi.fn(async () => 'test-secret'),
	processWebhookEnrollment: vi.fn(async () => ({
		enrollmentsFound: 1,
		enrollmentsCreated: 1,
		subscribersCreated: 1,
		errors: 0
	})),
	createWebhookLog: vi.fn(async (...args: [string, string?]) => {
		void args;
		return 42;
	}),
	finishWebhookLog: vi.fn(async () => undefined)
}));

vi.mock('$lib/services/enrollments', () => ({
	getWebhookSecret: mocks.getWebhookSecret,
	processWebhookEnrollment: mocks.processWebhookEnrollment
}));
vi.mock('$lib/services/enrollment-webhook-log', () => ({
	createWebhookLog: mocks.createWebhookLog,
	finishWebhookLog: mocks.finishWebhookLog,
	serializeWebhookPayload: JSON.stringify
}));

import { POST } from './+server';

function event(body: string, secret = 'test-secret'): RequestEvent {
	return {
		request: new Request('http://localhost/api/v1/webhooks/enrollments', {
			method: 'POST',
			headers: { 'X-Webhook-Secret': secret },
			body
		})
	} as RequestEvent;
}

const validPayload = {
	id: 'enrollment-1',
	orderId: 'order-1',
	lineItemId: 'line-1',
	quantity: 1,
	customerEmail: 'student@example.com',
	participants: [],
	status: 'COMPLETED',
	createdAt: '2026-09-28T08:00:00.000Z',
	updatedAt: '2026-09-28T08:00:00.000Z',
	preferredDate: '2026-09-28',
	endDate: '2026-10-02'
};

beforeEach(() => vi.clearAllMocks());

describe('webhook log', () => {
	it('never stores a request with the wrong secret', async () => {
		const response = await POST(event(JSON.stringify(validPayload), 'wrong'));
		expect(response.status).toBe(401);
		expect(mocks.createWebhookLog).not.toHaveBeenCalled();
	});

	it('stores the authenticated payload and processing outcome', async () => {
		const response = await POST(event(JSON.stringify(validPayload)));
		expect(response.status).toBe(200);
		expect(mocks.createWebhookLog).toHaveBeenCalledWith(
			expect.stringContaining('2026-10-02'),
			'enrollment-1'
		);
		expect(mocks.finishWebhookLog).toHaveBeenCalledWith(42, 'processed', 200, 'enrollment-1');
	});

	it('records invalid JSON without persisting its raw body', async () => {
		const response = await POST(event('{invalid'));
		expect(response.status).toBe(400);
		expect(mocks.createWebhookLog).toHaveBeenCalledWith(
			'[JSON non valido: corpo non archiviato]',
			undefined
		);
		expect(mocks.finishWebhookLog).toHaveBeenCalledWith(42, 'invalid_json', 400, undefined);
	});

	it('records processing failures without exposing the error in the saved payload', async () => {
		mocks.processWebhookEnrollment.mockRejectedValueOnce(new Error('database unavailable'));
		const response = await POST(event(JSON.stringify(validPayload)));
		expect(response.status).toBe(500);
		expect(mocks.finishWebhookLog).toHaveBeenCalledWith(42, 'failed', 500, 'enrollment-1');
		expect(mocks.createWebhookLog.mock.calls[0][0]).not.toContain('database unavailable');
	});
});
