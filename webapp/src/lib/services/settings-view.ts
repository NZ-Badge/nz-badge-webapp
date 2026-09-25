/**
 * Read-only view of the runtime settings for the admin UI and API.
 * Secret material (Enrollment API key, webhook secret, MIFARE keys) never leaves the
 * server in clear: callers get masked rows and `has*` flags instead.
 */

import { count, eq, not } from 'drizzle-orm';
import { db } from '$lib/db';
import { cardRfid, settings, type Setting } from '$lib/db/schema';
import { getMifareKeyConfig, type MifareKeyConfig } from '$lib/services/mifare-keys';

export const ENROLLMENT_API_URL_SETTING = 'enrollment_api_url';
export const ENROLLMENT_API_KEY_SETTING = 'enrollment_api_key';
export const WEBHOOK_SECRET_SETTING = 'webhook_enrollment_secret';

/** Settings whose value must never be returned to the client. */
export const SECRET_SETTING_KEYS: readonly string[] = [
	ENROLLMENT_API_KEY_SETTING,
	WEBHOOK_SECRET_SETTING
];

export const MASKED_VALUE = '********';

export interface SettingsValues {
	reset_entry_type_daily: boolean;
	min_swipe_interval_minutes: number;
	enforce_course_date_range: boolean;
	weekly_attendance_summary_enabled: boolean;
	use_mifare: boolean;
	use_single_mifare_key: boolean;
	enrollment_api_url: string;
}

export interface MaskedMifareKeyConfig {
	useMifare: boolean;
	useSingleKey: boolean;
	hasKeys: boolean;
}

export interface SettingsOverview {
	settings: Setting[];
	values: SettingsValues;
	mifareKeys: MaskedMifareKeyConfig;
	activeCardsCount: number;
	enrollmentApi: { url: string | null; hasKey: boolean };
	webhook: { hasSecret: boolean };
}

function hasValue(value: string | null | undefined): boolean {
	return typeof value === 'string' && value.length > 0;
}

/** Replace the value of secret settings with a fixed mask (empty stays empty). */
export function maskSettingRows(rows: Setting[]): Setting[] {
	return rows.map((row) =>
		SECRET_SETTING_KEYS.includes(row.key)
			? { ...row, value: hasValue(row.value) ? MASKED_VALUE : '' }
			: row
	);
}

/** Typed key→value map of the non-secret settings. */
export function toSettingsValues(rows: Setting[]): SettingsValues {
	const map: Record<string, boolean | number | string> = {};
	for (const row of rows) {
		if (SECRET_SETTING_KEYS.includes(row.key)) continue;
		switch (row.dataType) {
			case 'boolean':
				map[row.key] = row.value === 'true';
				break;
			case 'integer':
				map[row.key] = parseInt(row.value, 10);
				break;
			default:
				map[row.key] = row.value;
		}
	}
	return map as unknown as SettingsValues;
}

export function maskMifareKeyConfig(config: MifareKeyConfig): MaskedMifareKeyConfig {
	return {
		useMifare: config.useMifare,
		useSingleKey: config.useSingleKey,
		hasKeys: config.keys !== null
	};
}

export async function countActiveCards(): Promise<number> {
	const result = await db
		.select({ count: count() })
		.from(cardRfid)
		.where(not(eq(cardRfid.status, 'deleted')));
	return result[0]?.count ?? 0;
}

/** Load all settings with secrets masked. */
export async function getSettingsOverview(): Promise<SettingsOverview> {
	const rows = await db.select().from(settings);
	const [mifareConfig, activeCardsCount] = await Promise.all([
		getMifareKeyConfig(),
		countActiveCards()
	]);
	const byKey = new Map(rows.map((row) => [row.key, row.value]));

	return {
		settings: maskSettingRows(rows),
		values: toSettingsValues(rows),
		mifareKeys: maskMifareKeyConfig(mifareConfig),
		activeCardsCount,
		enrollmentApi: {
			url: byKey.get(ENROLLMENT_API_URL_SETTING) || null,
			hasKey: hasValue(byKey.get(ENROLLMENT_API_KEY_SETTING))
		},
		webhook: { hasSecret: hasValue(byKey.get(WEBHOOK_SECRET_SETTING)) }
	};
}
