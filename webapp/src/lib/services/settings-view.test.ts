import { describe, expect, it, vi } from 'vitest';
import type { Setting } from '$lib/db/schema';

vi.mock('$lib/db', () => ({ db: {} }));
vi.mock('$lib/services/mifare-keys', () => ({ getMifareKeyConfig: vi.fn() }));

import {
	MASKED_VALUE,
	maskMifareKeyConfig,
	maskSettingRows,
	toSettingsValues
} from './settings-view';

function row(key: string, value: string, dataType = 'string'): Setting {
	return { id: 1, key, value, dataType, description: null } as unknown as Setting;
}

const rows = [
	row('enrollment_api_url', 'https://api.example.com'),
	row('enrollment_api_key', 'sk-very-secret'),
	row('webhook_enrollment_secret', ''),
	row('use_mifare', 'true', 'boolean'),
	row('min_swipe_interval_minutes', '15', 'integer')
];

describe('settings masking', () => {
	it('never exposes secret values', () => {
		const masked = maskSettingRows(rows);
		const serialized = JSON.stringify(masked);
		expect(serialized).not.toContain('sk-very-secret');
		expect(masked.find((r) => r.key === 'enrollment_api_key')?.value).toBe(MASKED_VALUE);
		expect(masked.find((r) => r.key === 'webhook_enrollment_secret')?.value).toBe('');
		expect(masked.find((r) => r.key === 'enrollment_api_url')?.value).toBe(
			'https://api.example.com'
		);
	});

	it('excludes secrets from the typed values map', () => {
		const values = toSettingsValues(rows) as unknown as Record<string, unknown>;
		expect(values).toMatchObject({
			enrollment_api_url: 'https://api.example.com',
			use_mifare: true,
			min_swipe_interval_minutes: 15
		});
		expect(values).not.toHaveProperty('enrollment_api_key');
		expect(values).not.toHaveProperty('webhook_enrollment_secret');
	});

	it('reports MIFARE keys only as a flag', () => {
		const masked = maskMifareKeyConfig({
			useMifare: true,
			useSingleKey: true,
			keys: { keyA: 'A1A2A3A4A5A6', keyB: 'B1B2B3B4B5B6' }
		});
		expect(masked).toEqual({ useMifare: true, useSingleKey: true, hasKeys: true });
		expect(JSON.stringify(masked)).not.toContain('A1A2');
	});
});
