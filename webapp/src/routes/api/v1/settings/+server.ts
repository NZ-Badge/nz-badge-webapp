import type { RequestEvent } from '@sveltejs/kit';
import { ok, badRequest, serverError, conflict, authErrorResponse } from '$lib/utils/api';
import { logAudit } from '$lib/services/audit';
import { getMifareKeyConfig, regenerateGlobalKeys } from '$lib/services/mifare-keys';
import {
	getSetting,
	getSettingRows,
	setSettings,
	type SettingsUpdate
} from '$lib/services/settings';
import {
	countActiveCards,
	getSettingsOverview,
	maskMifareKeyConfig,
	maskSettingRows,
	MASKED_VALUE,
	SECRET_SETTING_KEYS
} from '$lib/services/settings-view';
import { z } from 'zod';

// Schema per validare l'aggiornamento dei settings
const settingUpdateSchema = z.object({
	reset_entry_type_daily: z.boolean().optional(),
	min_swipe_interval_minutes: z.number().int().min(1).max(1440).optional(),
	enforce_course_date_range: z.boolean().optional(),
	weekly_attendance_summary_enabled: z.boolean().optional(),
	use_single_mifare_key: z.boolean().optional(),
	use_mifare: z.boolean().optional(),
	regenerate_mifare_keys: z.boolean().optional(),
	enrollment_api_url: z.string().trim().max(2048).optional(),
	// Omesso = invariato; null = rimuove la chiave salvata; stringa vuota = invariato.
	enrollment_api_key: z.string().trim().max(1024).nullable().optional()
});

/**
 * GET /api/v1/settings
 * Restituisce i settings (segreti mascherati) e lo stato della configurazione MIFARE.
 * Solo Amministratori.
 */
export async function GET(event: RequestEvent): Promise<Response> {
	try {
		await event.locals.verifyAdminOnly();
	} catch (err) {
		return authErrorResponse(err);
	}

	try {
		const overview = await getSettingsOverview();
		return ok({
			settings: overview.settings,
			values: overview.values,
			mifare_keys: overview.mifareKeys,
			active_cards_count: overview.activeCardsCount,
			enrollment_api: {
				url: overview.enrollmentApi.url,
				has_key: overview.enrollmentApi.hasKey
			},
			webhook: { has_secret: overview.webhook.hasSecret }
		});
	} catch (err) {
		console.error('[settings] GET error:', err);
		return serverError();
	}
}

/**
 * PATCH /api/v1/settings
 * Aggiorna uno o più settings
 */
export async function PATCH(event: RequestEvent): Promise<Response> {
	let user;
	try {
		user = await event.locals.verifyAdminOnly();
	} catch (err) {
		return authErrorResponse(err);
	}

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return badRequest('Invalid JSON body');
	}

	const parsed = settingUpdateSchema.safeParse(body);
	if (!parsed.success) {
		return badRequest('Invalid settings data', parsed.error.issues);
	}

	const {
		regenerate_mifare_keys: regenerateMifareKeys,
		enrollment_api_key: enrollmentApiKey,
		...changes
	} = parsed.data;
	const userId = user.id;

	try {
		// Abilitazione modalità chiave unica: consentita solo senza card attive (false → true).
		if (changes.use_single_mifare_key === true && !(await getSetting('use_single_mifare_key'))) {
			const activeCards = await countActiveCards();
			if (activeCards > 0) {
				return conflict(
					`Impossibile abilitare la modalità chiave unica: esistono ${activeCards} card attive nel sistema. ` +
						`Tutte le card devono essere disattivate o cancellate prima di attivare questa opzione. ` +
						`Una volta attivata, le card esistenti non funzioneranno più.`,
					{ active_cards_count: activeCards }
				);
			}
		}

		if (regenerateMifareKeys) {
			await regenerateGlobalKeys();
		}

		// Una stringa vuota non sovrascrive la chiave: l'UI non la riceve mai in chiaro.
		// null la rimuove esplicitamente.
		const update: SettingsUpdate = { ...changes };
		if (enrollmentApiKey === null) update.enrollment_api_key = '';
		else if (enrollmentApiKey) update.enrollment_api_key = enrollmentApiKey;

		const changedKeys = await setSettings(update, { userId });

		if (changedKeys.length > 0 || regenerateMifareKeys) {
			const dataAfter: Record<string, unknown> = {};
			for (const key of changedKeys) {
				dataAfter[key] = SECRET_SETTING_KEYS.includes(key) ? MASKED_VALUE : update[key];
			}
			if (regenerateMifareKeys) dataAfter.mifare_keys_regenerated = true;
			await logAudit({ userId, action: 'SETTINGS_UPDATE', entityType: 'setting', dataAfter });
		}

		const [allSettings, mifareConfig] = await Promise.all([getSettingRows(), getMifareKeyConfig()]);

		return ok({
			settings: maskSettingRows(allSettings),
			mifare_keys: maskMifareKeyConfig(mifareConfig)
		});
	} catch (err) {
		console.error('[settings] PATCH error:', err);
		return serverError();
	}
}
