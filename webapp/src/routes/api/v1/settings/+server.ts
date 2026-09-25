import type { RequestEvent } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/db';
import { settings } from '$lib/db/schema';
import { ok, badRequest, unauthorized, forbidden, serverError, conflict } from '$lib/utils/api';
import { AuthError } from '$lib/services/auth';
import {
	getMifareKeyConfig,
	regenerateGlobalKeys,
	setSingleKeyMode,
	isSingleKeyModeEnabled
} from '$lib/services/mifare-keys';
import { setEnrollmentApiConfig } from '$lib/services/enrollments';
import {
	countActiveCards,
	getSettingsOverview,
	maskMifareKeyConfig,
	maskSettingRows,
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

function authFailure(err: unknown): Response {
	if (!(err instanceof AuthError)) return serverError();
	return err.code === 'FORBIDDEN' ? forbidden(err.message) : unauthorized(err.message);
}

/**
 * GET /api/v1/settings
 * Restituisce i settings (segreti mascherati) e lo stato della configurazione MIFARE.
 * Solo Amministratori.
 */
export async function GET(event: RequestEvent): Promise<Response> {
	try {
		await event.locals.verifyAdminOnly();
	} catch (err) {
		return authFailure(err);
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
		return authFailure(err);
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

	const updates = parsed.data;
	const userId = user.id;

	try {
		// Gestisci rigenerazione chiavi MIFARE se richiesto
		if (updates.regenerate_mifare_keys) {
			await regenerateGlobalKeys();
		}
		delete (updates as Record<string, unknown>).regenerate_mifare_keys;

		// Gestisci abilitazione modalità chiave unica
		if (updates.use_single_mifare_key !== undefined) {
			// Valida solo se stiamo effettivamente cambiando da false → true
			if (updates.use_single_mifare_key) {
				const alreadyEnabled = await isSingleKeyModeEnabled();
				if (!alreadyEnabled) {
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
			}
			await setSingleKeyMode(updates.use_single_mifare_key, userId);
		}
		delete (updates as Record<string, unknown>).use_single_mifare_key;

		// Gestisci abilitazione modalità MIFARE (scrittura chiavi su carta)
		if (updates.use_mifare !== undefined) {
			const stringValue = String(updates.use_mifare);
			await db
				.update(settings)
				.set({
					value: stringValue,
					updatedByUserId: userId
				})
				.where(eq(settings.key, 'use_mifare'));
		}
		delete (updates as Record<string, unknown>).use_mifare;

		// Gestisci configurazione Enrollment API
		// Una stringa vuota non sovrascrive la chiave: l'UI non la riceve mai in chiaro.
		const apiKey = updates.enrollment_api_key === '' ? undefined : updates.enrollment_api_key;
		if (updates.enrollment_api_url !== undefined || apiKey !== undefined) {
			await setEnrollmentApiConfig({ url: updates.enrollment_api_url, key: apiKey });
		}
		delete (updates as Record<string, unknown>).enrollment_api_url;
		delete (updates as Record<string, unknown>).enrollment_api_key;

		// Aggiorna gli altri setting tradizionali
		for (const [key, value] of Object.entries(updates)) {
			if (value === undefined || SECRET_SETTING_KEYS.includes(key)) continue;

			const stringValue = String(value);
			await db
				.update(settings)
				.set({
					value: stringValue,
					updatedByUserId: userId
				})
				.where(eq(settings.key, key));
		}

		// Recupera i settings aggiornati e la configurazione MIFARE
		const allSettings = await db.select().from(settings);
		const mifareConfig = await getMifareKeyConfig();

		return ok({
			settings: maskSettingRows(allSettings),
			mifare_keys: maskMifareKeyConfig(mifareConfig)
		});
	} catch (err) {
		console.error('[settings] PATCH error:', err);
		return serverError();
	}
}
