import { db } from '$lib/db';
import { settings, cardRfid } from '$lib/db/schema';
import { getMifareKeyConfig } from '$lib/services/mifare-keys';
import { getWebhookSecret, getEnrollmentApiConfig } from '$lib/services/enrollments';
import { count, not, eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { AuthError, requireAdmin } from '$lib/services/auth';

interface SettingsMap {
	reset_entry_type_daily: boolean;
	min_swipe_interval_minutes: number;
	weekly_attendance_summary_enabled: boolean;
	use_mifare: boolean;
	use_single_mifare_key: boolean;
	enrollment_api_url: string;
	enrollment_api_key: string;
}

export const load: PageServerLoad = async ({ locals }) => {
	// Only admin can access settings
	try {
		const user = await locals.verifyAdmin();
		requireAdmin(user);
	} catch (err) {
		if (err instanceof AuthError) {
			if (err.code === 'FORBIDDEN') {
				error(403, 'Admin access required');
			}
			error(401, 'Unauthorized');
		}
		throw err;
	}

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

	// Recupera configurazione MIFARE
	const mifareConfig = await getMifareKeyConfig();

	// Conta le card attive (non cancellate)
	const activeCardsResult = await db
		.select({ count: count() })
		.from(cardRfid)
		.where(not(eq(cardRfid.status, 'deleted')));
	const activeCardsCount = activeCardsResult[0]?.count ?? 0;

	const webhookSecret = await getWebhookSecret();
	const enrollmentApiConfig = await getEnrollmentApiConfig();

	return {
		settings: allSettings,
		values: settingsMap as unknown as SettingsMap,
		mifareKeys: mifareConfig,
		activeCardsCount,
		webhookSecret,
		enrollmentApiConfig
	};
};
