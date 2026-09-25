import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requirePageAdmin } from '$lib/services/auth';
import { getSettingsOverview } from '$lib/services/settings-view';
import {
	SettingsUpdateError,
	updateSettings,
	type SettingsPatch
} from '$lib/services/settings-update';
import { regenerateWebhookSecret, testEnrollmentApiConnection } from '$lib/services/enrollments';
import { createLogger } from '$lib/server/logger';

const log = createLogger('settings');

export const load: PageServerLoad = async ({ locals }) => {
	// Only admin can access settings
	await requirePageAdmin(locals);

	// Secrets are masked: the page only learns whether they are configured.
	return getSettingsOverview();
};

/** Applica le modifiche tramite il service; un errore di validazione diventa `fail()`. */
async function applySettings(patch: SettingsPatch, actor: { id: number }) {
	try {
		return { ok: true as const, result: await updateSettings(patch, actor) };
	} catch (err) {
		if (!(err instanceof SettingsUpdateError)) throw err;
		return { ok: false as const, failure: fail(err.status, { message: err.message }) };
	}
}

function field(form: FormData, name: string): string {
	const value = form.get(name);
	return typeof value === 'string' ? value.trim() : '';
}

function bool(form: FormData, name: string): boolean {
	return field(form, name) === 'true';
}

/*
 * Le action chiamano gli stessi service di PATCH /api/v1/settings e degli altri endpoint admin:
 * validazione, controlli (es. chiave unica con card attive) e audit restano in un solo punto.
 * Ogni action ripete comunque il controllo di ruolo, perché il load non viene eseguito per le POST.
 */
export const actions: Actions = {
	save: async ({ request, locals }) => {
		const actor = await requirePageAdmin(locals);
		const form = await request.formData();

		const minInterval = Number(field(form, 'min_swipe_interval_minutes'));
		if (!Number.isInteger(minInterval) || minInterval < 1 || minInterval > 1440) {
			return fail(400, { message: 'L’intervallo minimo deve essere tra 1 e 1440 minuti' });
		}

		const newApiKey = field(form, 'enrollment_api_key');
		const body: SettingsPatch = {
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

		const res = await applySettings(body, actor);
		if (!res.ok) return res.failure;
		return { saved: true };
	},

	setMifare: async ({ request, locals }) => {
		const actor = await requirePageAdmin(locals);
		const form = await request.formData();
		const useMifare = bool(form, 'use_mifare');
		const res = await applySettings({ use_mifare: useMifare }, actor);
		if (!res.ok) return res.failure;
		return { useMifare, mifareKeys: res.result.mifareKeys };
	},

	regenerateMifareKeys: async ({ locals }) => {
		const actor = await requirePageAdmin(locals);
		const res = await applySettings({ regenerate_mifare_keys: true }, actor);
		if (!res.ok) return res.failure;
		return { mifareKeys: res.result.mifareKeys };
	},

	generateWebhookSecret: async ({ locals }) => {
		await requirePageAdmin(locals);
		return { secret: await regenerateWebhookSecret() };
	},

	testEnrollmentApi: async ({ request, locals }) => {
		await requirePageAdmin(locals);
		const form = await request.formData();
		// Senza chiave digitata il server usa quella salvata.
		try {
			return await testEnrollmentApiConnection({
				url: field(form, 'url'),
				key: field(form, 'key') || null
			});
		} catch (err) {
			log.error('Enrollment API test failed', { err });
			return fail(502, { message: 'Impossibile verificare la connessione' });
		}
	}
};
