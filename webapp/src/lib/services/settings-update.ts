/**
 * Admin update of the runtime settings, shared by `PATCH /api/v1/settings` and the settings
 * page actions. Validates the patch, enforces the single-key rule, persists everything via
 * `setSettings` and writes one audit entry with secret values masked.
 */

import { z } from 'zod';
import type { Setting, User } from '$lib/db/schema';
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
	maskMifareKeyConfig,
	maskSettingRows,
	MASKED_VALUE,
	SECRET_SETTING_KEYS,
	type MaskedMifareKeyConfig
} from '$lib/services/settings-view';

export const settingsPatchSchema = z.object({
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

export type SettingsPatch = z.input<typeof settingsPatchSchema>;

export class SettingsUpdateError extends Error {
	constructor(
		message: string,
		public readonly code: 'VALIDATION_ERROR' | 'ACTIVE_CARDS',
		public readonly details?: unknown
	) {
		super(message);
		this.name = 'SettingsUpdateError';
	}

	get status(): 400 | 409 {
		return this.code === 'VALIDATION_ERROR' ? 400 : 409;
	}
}

export interface SettingsUpdateResult {
	settings: Setting[];
	mifareKeys: MaskedMifareKeyConfig;
}

/**
 * Validate and apply a settings patch. Throws `SettingsUpdateError` for invalid input (400)
 * or when single-key mode is requested while cards are still active (409).
 */
export async function updateSettings(
	input: unknown,
	actor: Pick<User, 'id'>
): Promise<SettingsUpdateResult> {
	const parsed = settingsPatchSchema.safeParse(input);
	if (!parsed.success) {
		throw new SettingsUpdateError(
			'Impostazioni non valide',
			'VALIDATION_ERROR',
			parsed.error.issues
		);
	}

	const {
		regenerate_mifare_keys: regenerateMifareKeys,
		enrollment_api_key: enrollmentApiKey,
		...changes
	} = parsed.data;
	const userId = actor.id;

	// Abilitazione modalità chiave unica: consentita solo senza card attive (false → true).
	if (changes.use_single_mifare_key === true && !(await getSetting('use_single_mifare_key'))) {
		const activeCards = await countActiveCards();
		if (activeCards > 0) {
			throw new SettingsUpdateError(
				`Impossibile abilitare la modalità chiave unica: esistono ${activeCards} card attive nel sistema. ` +
					`Tutte le card devono essere disattivate o cancellate prima di attivare questa opzione. ` +
					`Una volta attivata, le card esistenti non funzioneranno più.`,
				'ACTIVE_CARDS',
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

	return {
		settings: maskSettingRows(allSettings),
		mifareKeys: maskMifareKeyConfig(mifareConfig)
	};
}
