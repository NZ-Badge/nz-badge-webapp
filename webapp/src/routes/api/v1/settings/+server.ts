import type { RequestEvent } from '@sveltejs/kit';
import { eq, count, not } from 'drizzle-orm';
import { db } from '$lib/db';
import { settings, cardRfid } from '$lib/db/schema';
import { ok, badRequest, unauthorized, serverError, conflict } from '$lib/utils/api';
import { AuthError } from '$lib/services/auth';
import {
	getMifareKeyConfig,
	regenerateGlobalKeys,
	setSingleKeyMode,
	isSingleKeyModeEnabled
} from '$lib/services/mifare-keys';
import { setEnrollmentApiConfig } from '$lib/services/enrollments';
import { z } from 'zod';

// Schema per validare l'aggiornamento dei settings
const settingUpdateSchema = z.object({
	reset_entry_type_daily: z.boolean().optional(),
	min_swipe_interval_minutes: z.number().int().min(1).max(1440).optional(),
	weekly_attendance_summary_enabled: z.boolean().optional(),
	use_single_mifare_key: z.boolean().optional(),
	use_mifare: z.boolean().optional(),
	regenerate_mifare_keys: z.boolean().optional(),
	enrollment_api_url: z.string().optional(),
	enrollment_api_key: z.string().optional()
});

// Tipo per i settings con valori tipizzati
interface SettingsMap {
	reset_entry_type_daily: boolean;
	min_swipe_interval_minutes: number;
	weekly_attendance_summary_enabled: boolean;
	use_single_mifare_key: boolean;
	use_mifare: boolean;
}

/**
 * Conta le card RFID attive (non cancellate)
 */
async function countActiveCards(): Promise<number> {
	const result = await db
		.select({ count: count() })
		.from(cardRfid)
		.where(not(eq(cardRfid.status, 'deleted')));
	return result[0]?.count ?? 0;
}

/**
 * GET /api/v1/settings
 * Restituisce tutti i settings e la configurazione MIFARE
 */
export async function GET(event: RequestEvent): Promise<Response> {
	try {
		await event.locals.verifyAdmin();
	} catch (err) {
		return err instanceof AuthError ? unauthorized(err.message) : serverError();
	}

	try {
		const allSettings = await db.select().from(settings);

		// Converti in oggetto con valori tipizzati
		const settingsMap: Record<string, boolean | number | string> = {};
		for (const setting of allSettings) {
			switch (setting.dataType) {
				case 'boolean':
					settingsMap[setting.key] = setting.value === 'true';
					break;
				case 'integer':
					settingsMap[setting.key] = parseInt(setting.value, 10);
					break;
				default:
					settingsMap[setting.key] = setting.value;
			}
		}

		// Recupera anche la configurazione MIFARE
		const mifareConfig = await getMifareKeyConfig();
		const activeCardsCount = await countActiveCards();

		return ok({
			settings: allSettings,
			values: settingsMap as unknown as SettingsMap,
			mifare_keys: mifareConfig,
			active_cards_count: activeCardsCount
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
		user = await event.locals.verifyAdmin();
	} catch (err) {
		return err instanceof AuthError ? unauthorized(err.message) : serverError();
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
		if (updates.enrollment_api_url !== undefined || updates.enrollment_api_key !== undefined) {
			const url = updates.enrollment_api_url ?? '';
			const key = updates.enrollment_api_key ?? '';
			await setEnrollmentApiConfig(url, key);
		}
		delete (updates as Record<string, unknown>).enrollment_api_url;
		delete (updates as Record<string, unknown>).enrollment_api_key;

		// Aggiorna gli altri setting tradizionali
		for (const [key, value] of Object.entries(updates)) {
			if (value === undefined) continue;

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
			settings: allSettings,
			mifare_keys: mifareConfig
		});
	} catch (err) {
		console.error('[settings] PATCH error:', err);
		return serverError();
	}
}
