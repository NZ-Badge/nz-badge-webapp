/**
 * Typed schema of the runtime `settings` table (key/value/dataType rows).
 *
 * Kept free of `$lib` aliases and of the SvelteKit database singleton so that
 * standalone scripts (e.g. `scripts/send-weekly-attendance-summary.ts`, run with tsx)
 * can read settings with their own connection. The cached, app-wide accessors live in
 * `settings.ts`.
 */

import { z } from 'zod';
import { settings, type Setting } from '../db/schema';
import type { DbOrTx } from '../db/types';

type SettingDataType = NonNullable<Setting['dataType']>;

interface SettingDefinition {
	dataType: SettingDataType;
	description: string;
}

/** Known settings with the metadata used when a row has to be created. */
export const SETTING_DEFINITIONS = {
	reset_entry_type_daily: {
		dataType: 'boolean',
		description: 'Azzera tipo ingresso ogni giorno'
	},
	min_swipe_interval_minutes: {
		dataType: 'integer',
		description: 'Intervallo minimo tra strisciate per la stessa card (in minuti)'
	},
	enforce_course_date_range: {
		dataType: 'boolean',
		description: 'Rifiuta le strisciate fuori dalle date del corso'
	},
	weekly_attendance_summary_enabled: {
		dataType: 'boolean',
		description: 'Invia il riepilogo settimanale delle presenze agli iscritti'
	},
	use_mifare: {
		dataType: 'boolean',
		description: 'Abilita scrittura e cancellazione MIFARE (Key A/B su settori)'
	},
	use_single_mifare_key: {
		dataType: 'boolean',
		description: 'Usa la stessa coppia di chiavi MIFARE per tutte le card'
	},
	enrollment_api_url: {
		dataType: 'string',
		description: 'URL base API esterna iscrizioni'
	},
	enrollment_api_key: {
		dataType: 'string',
		description: 'API key per autenticazione API esterna iscrizioni'
	},
	webhook_enrollment_secret: {
		dataType: 'string',
		description: 'Secret per autenticare le chiamate webhook iscrizioni'
	}
} as const satisfies Record<string, SettingDefinition>;

export type SettingKey = keyof typeof SETTING_DEFINITIONS;

export const MIN_SWIPE_INTERVAL_RANGE = { min: 1, max: 1440 } as const;

// Raw values are strings; an invalid or missing value falls back to the default.
const booleanSetting = (fallback: boolean) =>
	z
		.enum(['true', 'false'])
		.transform((value) => value === 'true')
		.catch(fallback);

const integerSetting = (fallback: number, min: number, max: number) =>
	z.coerce.number().int().min(min).max(max).catch(fallback);

const stringSetting = () => z.string().catch('');

/** Parses the raw key→string map read from the database into typed values. */
export const appSettingsSchema = z.object({
	reset_entry_type_daily: booleanSetting(true),
	min_swipe_interval_minutes: integerSetting(
		15,
		MIN_SWIPE_INTERVAL_RANGE.min,
		MIN_SWIPE_INTERVAL_RANGE.max
	),
	enforce_course_date_range: booleanSetting(true),
	weekly_attendance_summary_enabled: booleanSetting(false),
	use_mifare: booleanSetting(false),
	use_single_mifare_key: booleanSetting(false),
	enrollment_api_url: stringSetting(),
	enrollment_api_key: stringSetting(),
	webhook_enrollment_secret: stringSetting()
});

export type AppSettings = z.output<typeof appSettingsSchema>;

/** Validates a partial, typed update before it is serialized to the table. */
export const settingsUpdateSchema = z
	.object({
		reset_entry_type_daily: z.boolean(),
		min_swipe_interval_minutes: z
			.number()
			.int()
			.min(MIN_SWIPE_INTERVAL_RANGE.min)
			.max(MIN_SWIPE_INTERVAL_RANGE.max),
		enforce_course_date_range: z.boolean(),
		weekly_attendance_summary_enabled: z.boolean(),
		use_mifare: z.boolean(),
		use_single_mifare_key: z.boolean(),
		enrollment_api_url: z.string().trim().max(2048),
		enrollment_api_key: z.string().trim().max(1024),
		webhook_enrollment_secret: z.string().max(255)
	})
	.partial()
	.strict();

export type SettingsUpdate = z.input<typeof settingsUpdateSchema>;

/** Convert database rows to typed settings, applying defaults for missing/invalid values. */
export function parseSettingRows(rows: Pick<Setting, 'key' | 'value'>[]): AppSettings {
	const raw: Record<string, string> = {};
	for (const row of rows) raw[row.key] = row.value;
	return appSettingsSchema.parse(raw);
}

export function serializeSettingValue(value: boolean | number | string): string {
	return String(value);
}

/** Uncached read, for scripts or callers that bring their own connection. */
export async function readSettingRows(database: DbOrTx): Promise<Setting[]> {
	return database.select().from(settings);
}

export async function readSettings(database: DbOrTx): Promise<AppSettings> {
	return parseSettingRows(await readSettingRows(database));
}
