/**
 * Runtime settings service.
 *
 * Reads the whole `settings` table once and keeps it in a short in-memory cache, so the
 * hot paths (device swipes, card writes) do not hit the database for every request.
 * Every write through `setSettings` invalidates the cache; external changes (manual SQL,
 * DB import) are picked up within `SETTINGS_CACHE_TTL_MS` or via `invalidateSettingsCache`.
 */

import { db } from '$lib/db';
import { settings, type Setting } from '$lib/db/schema';
import type { DbOrTx } from '$lib/db/types';
import {
	SETTING_DEFINITIONS,
	parseSettingRows,
	readSettingRows,
	serializeSettingValue,
	settingsUpdateSchema,
	type AppSettings,
	type SettingKey,
	type SettingsUpdate
} from './settings-schema';

export {
	SETTING_DEFINITIONS,
	parseSettingRows,
	settingsUpdateSchema,
	type AppSettings,
	type SettingKey,
	type SettingsUpdate
} from './settings-schema';

export const SETTINGS_CACHE_TTL_MS = 30_000;

interface CacheEntry {
	rows: Promise<Setting[]>;
	expiresAt: number;
}

let cache: CacheEntry | null = null;

export function invalidateSettingsCache(): void {
	cache = null;
}

/** All setting rows (secrets included — never return them to the client unmasked). */
export async function getSettingRows(): Promise<Setting[]> {
	const now = Date.now();
	if (cache && cache.expiresAt > now) return cache.rows;

	// Cache the pending promise so concurrent callers share a single query.
	const rows = readSettingRows(db);
	const entry: CacheEntry = { rows, expiresAt: now + SETTINGS_CACHE_TTL_MS };
	cache = entry;

	try {
		return await rows;
	} catch (err) {
		if (cache === entry) cache = null;
		throw err;
	}
}

export async function getSettings(): Promise<AppSettings> {
	return parseSettingRows(await getSettingRows());
}

export async function getSetting<K extends SettingKey>(key: K): Promise<AppSettings[K]> {
	return (await getSettings())[key];
}

/**
 * Validate and persist a partial settings update in a single transaction.
 * Missing rows are created with the metadata from `SETTING_DEFINITIONS`.
 * Pass `tx` to join a transaction opened by the caller.
 */
export async function setSettings(
	update: SettingsUpdate,
	options: { userId?: number; tx?: DbOrTx } = {}
): Promise<SettingKey[]> {
	const parsed = settingsUpdateSchema.parse(update);
	const entries = Object.entries(parsed).filter(([, value]) => value !== undefined) as [
		SettingKey,
		boolean | number | string
	][];
	if (entries.length === 0) return [];

	const write = async (database: DbOrTx) => {
		for (const [key, value] of entries) {
			const serialized = serializeSettingValue(value);
			const definition = SETTING_DEFINITIONS[key];
			await database
				.insert(settings)
				.values({
					key,
					value: serialized,
					dataType: definition.dataType,
					description: definition.description,
					updatedByUserId: options.userId ?? null
				})
				.onDuplicateKeyUpdate({
					set:
						options.userId !== undefined
							? { value: serialized, updatedByUserId: options.userId }
							: { value: serialized }
				});
		}
	};

	try {
		if (options.tx) {
			await write(options.tx);
		} else {
			await db.transaction(write);
		}
	} finally {
		invalidateSettingsCache();
	}

	return entries.map(([key]) => key);
}
