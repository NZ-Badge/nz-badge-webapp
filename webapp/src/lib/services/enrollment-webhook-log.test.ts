import { describe, expect, it } from 'vitest';
import { serializeWebhookPayload } from './enrollment-webhook-log';

describe('serializeWebhookPayload', () => {
	it('keeps course dates and participants while redacting nested credentials', () => {
		const payload = JSON.parse(
			serializeWebhookPayload({
				id: 'enrollment-1',
				endDate: '2026-10-02',
				apiKey: 'private-key',
				participants: [{ email: 'student@example.com', accessToken: 'private-token' }]
			})
		);

		expect(payload).toEqual({
			id: 'enrollment-1',
			endDate: '2026-10-02',
			apiKey: '[REDACTED]',
			participants: [{ email: 'student@example.com', accessToken: '[REDACTED]' }]
		});
	});
});
