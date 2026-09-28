import { requirePageAdmin } from '$lib/services/auth';
import {
	clearWebhookLogs,
	deleteWebhookLog,
	listWebhookLogs
} from '$lib/services/enrollment-webhook-log';
import { parsePagination } from '$lib/utils/pagination';
import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';

const PAGE_SIZE = 25;
const logIdSchema = z.coerce.number().int().positive();

export const load: PageServerLoad = async ({ locals, url, setHeaders }) => {
	await requirePageAdmin(locals);
	setHeaders({ 'Cache-Control': 'private, no-store' });
	const tab = url.searchParams.get('tab') === 'webhooks' ? 'webhooks' : 'database';
	if (tab === 'database') return { tab, logs: null };
	const requested = parsePagination(url, PAGE_SIZE);
	const result = await listWebhookLogs(requested.page, PAGE_SIZE);
	return { tab, logs: result };
};

export const actions: Actions = {
	deleteLog: async ({ locals, request }) => {
		const actor = await requirePageAdmin(locals);
		const form = await request.formData();
		const id = logIdSchema.safeParse(form.get('id'));
		if (!id.success) return fail(400, { message: 'Voce di log non valida' });
		if (!(await deleteWebhookLog(id.data, actor.id)))
			return fail(404, { message: 'Voce di log non trovata' });
		const page = z.coerce.number().int().positive().safeParse(form.get('page'));
		redirect(303, `/admin/maintenance?tab=webhooks&page=${page.success ? page.data : 1}`);
	},
	clearLogs: async ({ locals, request }) => {
		const actor = await requirePageAdmin(locals);
		const form = await request.formData();
		if (form.get('confirmation') !== 'SVUOTA') return fail(400, { message: 'Conferma non valida' });
		await clearWebhookLogs(actor.id);
		redirect(303, '/admin/maintenance?tab=webhooks');
	}
};
