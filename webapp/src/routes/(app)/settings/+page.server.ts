import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requirePageAdmin } from '$lib/services/auth';
import { getSettingsOverview, type MaskedMifareKeyConfig } from '$lib/services/settings-view';
import { apiAction } from '$lib/utils/http';

export const load: PageServerLoad = async ({ locals }) => {
	// Only admin can access settings
	await requirePageAdmin(locals);

	// Secrets are masked: the page only learns whether they are configured.
	return getSettingsOverview();
};

type PatchResult = { mifare_keys?: MaskedMifareKeyConfig };

function field(form: FormData, name: string): string {
	const value = form.get(name);
	return typeof value === 'string' ? value.trim() : '';
}

function bool(form: FormData, name: string): boolean {
	return field(form, name) === 'true';
}

/*
 * Le action delegano a PATCH /api/v1/settings e agli altri endpoint admin tramite `event.fetch`:
 * validazione, controlli (es. chiave unica con card attive) e audit restano in un solo punto.
 * Ogni action ripete comunque il controllo di ruolo, perché il load non viene eseguito per le POST.
 */
export const actions: Actions = {
	save: async ({ request, locals, fetch }) => {
		await requirePageAdmin(locals);
		const form = await request.formData();

		const minInterval = Number(field(form, 'min_swipe_interval_minutes'));
		if (!Number.isInteger(minInterval) || minInterval < 1 || minInterval > 1440) {
			return fail(400, { message: 'L’intervallo minimo deve essere tra 1 e 1440 minuti' });
		}

		const newApiKey = field(form, 'enrollment_api_key');
		const body: Record<string, unknown> = {
			reset_entry_type_daily: bool(form, 'reset_entry_type_daily'),
			min_swipe_interval_minutes: minInterval,
			enforce_course_date_range: bool(form, 'enforce_course_date_range'),
			weekly_attendance_summary_enabled: bool(form, 'weekly_attendance_summary_enabled'),
			enrollment_api_url: field(form, 'enrollment_api_url')
		};
		// La modalità chiave unica si invia solo quando MIFARE è abilitato.
		if (form.has('use_single_mifare_key')) {
			body.use_single_mifare_key = bool(form, 'use_single_mifare_key');
		}
		// La chiave API viene inviata solo se modificata: null la rimuove.
		if (newApiKey) body.enrollment_api_key = newApiKey;
		else if (bool(form, 'clear_enrollment_api_key')) body.enrollment_api_key = null;

		const res = await apiAction<PatchResult>('/api/v1/settings', {
			method: 'PATCH',
			body,
			fetch
		});
		if (!res.ok) return res.failure;
		return { saved: true };
	},

	setMifare: async ({ request, locals, fetch }) => {
		await requirePageAdmin(locals);
		const form = await request.formData();
		const useMifare = bool(form, 'use_mifare');
		const res = await apiAction<PatchResult>('/api/v1/settings', {
			method: 'PATCH',
			body: { use_mifare: useMifare },
			fetch
		});
		if (!res.ok) return res.failure;
		return { useMifare, mifareKeys: res.data.mifare_keys ?? null };
	},

	regenerateMifareKeys: async ({ locals, fetch }) => {
		await requirePageAdmin(locals);
		const res = await apiAction<PatchResult>('/api/v1/settings', {
			method: 'PATCH',
			body: { regenerate_mifare_keys: true },
			fetch
		});
		if (!res.ok) return res.failure;
		return { mifareKeys: res.data.mifare_keys ?? null };
	},

	generateWebhookSecret: async ({ locals, fetch }) => {
		await requirePageAdmin(locals);
		const res = await apiAction<{ secret: string }>('/api/v1/webhooks/enrollments/secret', {
			method: 'POST',
			fetch
		});
		if (!res.ok) return res.failure;
		return { secret: res.data.secret };
	},

	testEnrollmentApi: async ({ request, locals, fetch }) => {
		await requirePageAdmin(locals);
		const form = await request.formData();
		// Senza chiave digitata il server usa quella salvata.
		const res = await apiAction<{ success?: boolean; message?: string }>(
			'/api/v1/settings/enrollment-api/test',
			{
				method: 'POST',
				body: {
					url: field(form, 'url'),
					key: field(form, 'key') || undefined
				},
				fetch
			}
		);
		if (!res.ok) return res.failure;
		const success = res.data.success ?? false;
		return {
			success,
			message: res.data.message || (success ? 'Connessione riuscita' : 'Errore di connessione')
		};
	}
};
