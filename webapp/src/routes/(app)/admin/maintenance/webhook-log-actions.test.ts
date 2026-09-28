import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	requirePageAdmin: vi.fn(async () => ({ id: 9 })),
	deleteWebhookLog: vi.fn(async () => true),
	clearWebhookLogs: vi.fn(async () => 2),
	listWebhookLogs: vi.fn()
}));

vi.mock('$lib/services/auth', () => ({ requirePageAdmin: mocks.requirePageAdmin }));
vi.mock('$lib/services/enrollment-webhook-log', () => ({
	deleteWebhookLog: mocks.deleteWebhookLog,
	clearWebhookLogs: mocks.clearWebhookLogs,
	listWebhookLogs: mocks.listWebhookLogs
}));

import { actions } from './+page.server';

function actionEvent(values: Record<string, string>) {
	const form = new FormData();
	for (const [key, value] of Object.entries(values)) form.set(key, value);
	return {
		locals: {},
		request: new Request('http://localhost/admin/maintenance', { method: 'POST', body: form })
	} as never;
}

beforeEach(() => vi.clearAllMocks());

describe('maintenance webhook log actions', () => {
	it('requires an administrator before deleting a log', async () => {
		mocks.requirePageAdmin.mockRejectedValueOnce(new Error('forbidden'));
		await expect(actions.deleteLog!(actionEvent({ id: '1' }))).rejects.toThrow('forbidden');
		expect(mocks.deleteWebhookLog).not.toHaveBeenCalled();
	});

	it('rejects an invalid log id', async () => {
		const result = await actions.deleteLog!(actionEvent({ id: '-1' }));
		expect(result).toMatchObject({ status: 400 });
		expect(mocks.deleteWebhookLog).not.toHaveBeenCalled();
	});

	it('deletes only the selected log and returns to the current page', async () => {
		await expect(actions.deleteLog!(actionEvent({ id: '42', page: '3' }))).rejects.toMatchObject({
			status: 303,
			location: '/admin/maintenance?tab=webhooks&page=3'
		});
		expect(mocks.deleteWebhookLog).toHaveBeenCalledWith(42, 9);
	});

	it('requires the confirmation word before clearing all logs', async () => {
		const result = await actions.clearLogs!(actionEvent({ confirmation: 'no' }));
		expect(result).toMatchObject({ status: 400 });
		expect(mocks.clearWebhookLogs).not.toHaveBeenCalled();
	});

	it('clears logs for an administrator after confirmation', async () => {
		await expect(actions.clearLogs!(actionEvent({ confirmation: 'SVUOTA' }))).rejects.toMatchObject(
			{
				status: 303,
				location: '/admin/maintenance?tab=webhooks'
			}
		);
		expect(mocks.clearWebhookLogs).toHaveBeenCalledWith(9);
	});
});
