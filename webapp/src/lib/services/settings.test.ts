import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const from = vi.fn();
	const onDuplicateKeyUpdate = vi.fn(async () => undefined);
	const values = vi.fn(() => ({ onDuplicateKeyUpdate }));
	const tx = { insert: vi.fn(() => ({ values })) };
	return {
		from,
		values,
		onDuplicateKeyUpdate,
		tx,
		db: {
			select: vi.fn(() => ({ from })),
			transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx))
		}
	};
});

vi.mock('$lib/db', () => ({ db: mocks.db }));

import {
	getSetting,
	getSettings,
	invalidateSettingsCache,
	parseSettingRows,
	setSettings,
	SETTINGS_CACHE_TTL_MS
} from './settings';

const row = (key: string, value: string) => ({ key, value });

describe('parseSettingRows', () => {
	it('applies defaults for missing or invalid values', () => {
		expect(parseSettingRows([])).toEqual({
			reset_entry_type_daily: true,
			min_swipe_interval_minutes: 15,
			enforce_course_date_range: true,
			weekly_attendance_summary_enabled: false,
			use_mifare: false,
			use_single_mifare_key: false,
			enrollment_api_url: '',
			enrollment_api_key: '',
			webhook_enrollment_secret: ''
		});
		const parsed = parseSettingRows([
			row('min_swipe_interval_minutes', 'abc'),
			row('reset_entry_type_daily', 'maybe')
		]);
		expect(parsed.min_swipe_interval_minutes).toBe(15);
		expect(parsed.reset_entry_type_daily).toBe(true);
	});

	it('parses typed values and ignores unknown keys', () => {
		const parsed = parseSettingRows([
			row('min_swipe_interval_minutes', '5'),
			row('reset_entry_type_daily', 'false'),
			row('use_mifare', 'true'),
			row('enrollment_api_url', 'https://api.example.com'),
			row('legacy_key', 'x')
		]);
		expect(parsed).toMatchObject({
			min_swipe_interval_minutes: 5,
			reset_entry_type_daily: false,
			use_mifare: true,
			enrollment_api_url: 'https://api.example.com'
		});
		expect(parsed).not.toHaveProperty('legacy_key');
	});
});

describe('settings cache', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		invalidateSettingsCache();
		mocks.from.mockResolvedValue([row('use_mifare', 'true')]);
	});

	afterEach(() => vi.useRealTimers());

	it('reads the table once within the TTL and shares concurrent loads', async () => {
		vi.useFakeTimers();
		await Promise.all([getSettings(), getSetting('use_mifare'), getSetting('use_mifare')]);
		expect(await getSetting('use_mifare')).toBe(true);
		expect(mocks.db.select).toHaveBeenCalledTimes(1);

		vi.advanceTimersByTime(SETTINGS_CACHE_TTL_MS + 1);
		await getSettings();
		expect(mocks.db.select).toHaveBeenCalledTimes(2);
	});

	it('does not cache a failed load', async () => {
		mocks.from.mockRejectedValueOnce(new Error('db down'));
		await expect(getSettings()).rejects.toThrow('db down');
		expect(await getSetting('use_mifare')).toBe(true);
		expect(mocks.db.select).toHaveBeenCalledTimes(2);
	});

	it('invalidates the cache after a write', async () => {
		await getSettings();
		mocks.from.mockResolvedValue([row('use_mifare', 'false')]);
		await setSettings({ use_mifare: false });
		expect(await getSetting('use_mifare')).toBe(false);
		expect(mocks.db.select).toHaveBeenCalledTimes(2);
	});
});

describe('setSettings', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.from.mockResolvedValue([]);
	});

	it('upserts every key inside one transaction', async () => {
		const keys = await setSettings(
			{ use_mifare: true, min_swipe_interval_minutes: 10, enrollment_api_url: ' https://x.it ' },
			{ userId: 7 }
		);
		expect([...keys].sort()).toEqual([
			'enrollment_api_url',
			'min_swipe_interval_minutes',
			'use_mifare'
		]);
		expect(mocks.db.transaction).toHaveBeenCalledTimes(1);
		expect(mocks.tx.insert).toHaveBeenCalledTimes(3);
		expect(mocks.values).toHaveBeenCalledWith(
			expect.objectContaining({
				key: 'min_swipe_interval_minutes',
				value: '10',
				dataType: 'integer',
				updatedByUserId: 7
			})
		);
		expect(mocks.values).toHaveBeenCalledWith(
			expect.objectContaining({ key: 'enrollment_api_url', value: 'https://x.it' })
		);
		expect(mocks.onDuplicateKeyUpdate).toHaveBeenCalledWith({
			set: { value: 'true', updatedByUserId: 7 }
		});
	});

	it('joins the caller transaction when one is passed', async () => {
		await setSettings({ use_mifare: true }, { tx: mocks.tx as never });
		expect(mocks.db.transaction).not.toHaveBeenCalled();
		expect(mocks.tx.insert).toHaveBeenCalledTimes(1);
	});

	it('rejects invalid values and unknown keys without writing', async () => {
		await expect(setSettings({ min_swipe_interval_minutes: 0 })).rejects.toThrow();
		await expect(setSettings({ nope: true } as never)).rejects.toThrow();
		expect(mocks.db.transaction).not.toHaveBeenCalled();
	});

	it('does nothing for an empty update', async () => {
		expect(await setSettings({})).toEqual([]);
		expect(mocks.db.transaction).not.toHaveBeenCalled();
	});
});
