import { expect, test } from '@playwright/test';

test.use({ locale: 'en-US', timezoneId: 'America/Los_Angeles' });

test.beforeEach(async ({ page }) => {
	await page.goto('/login');
	await page.getByRole('button', { name: 'Accedi', exact: true }).waitFor();
	await page.evaluate(async () => {
		const runtimePath = '/node_modules/.vite/deps/svelte.js';
		const fixturePath = '/src/lib/components/ui/date-picker/__fixtures__/DatePickers.svelte';
		const { mount } = await import(runtimePath);
		const { default: Fixture } = await import(fixturePath);
		document.body.replaceChildren();
		mount(Fixture, { target: document.body });
	});
});

test('formato italiano, calendario, cambio mese e invio ISO', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await expect(page.locator('#date-field')).toHaveText('05/01/2026');
	await page.getByRole('button', { name: 'Apri calendario' }).first().click();
	await expect(page.getByRole('grid').getByRole('columnheader')).toHaveText([
		'lun',
		'mar',
		'mer',
		'gio',
		'ven',
		'sab',
		'dom'
	]);
	await page.getByRole('button', { name: 'Mese successivo' }).click();
	await page.locator('[data-calendar-day][data-value="2026-02-12"]').click();
	await expect(page.locator('#date-field')).toHaveText('12/02/2026');
	await expect(page.getByTestId('date-value')).toHaveText('2026-02-12');
	await page.getByRole('button', { name: 'Invia', exact: true }).click();
	await expect(page.getByTestId('submitted')).toHaveText(
		'{"date":"2026-02-12","timestamp":"2026-01-05T13:45"}'
	);
	expect(errors).toEqual([]);
});

test('modifica ora anche parziale, validazione, reset esterno e bisestile', async ({ page }) => {
	const time = page.getByRole('textbox', { name: 'Ora (formato 24 ore)' });
	await time.fill('09:30');
	await expect(time).toHaveValue('09:30');
	await expect(page.getByTestId('timestamp-value')).toHaveText('2026-01-05T09:30');
	await time.fill('2');
	await expect(time).toHaveValue('2');
	await expect(page.getByTestId('timestamp-value')).toBeEmpty();
	await time.fill('25:00');
	expect(await time.evaluate((el: HTMLInputElement) => el.checkValidity())).toBe(false);
	await time.fill('23:59');
	await expect(page.getByTestId('timestamp-value')).toHaveText('2026-01-05T23:59');
	await page.getByRole('button', { name: 'Carica', exact: true }).click();
	await expect(page.locator('#date-field')).toHaveText('29/02/2028');
	await expect(time).toHaveValue('00:05');
	await page.getByRole('button', { name: 'Svuota', exact: true }).click();
	await expect(page.getByTestId('timestamp-value')).toBeEmpty();
	await expect(time).toBeEmpty();
});

test('segmenti da tastiera, cancellazione e disabled', async ({ page }) => {
	const day = page.locator('#date-field [data-segment="day"]');
	await page.locator('label[for="date"]').click();
	await expect(day).toBeFocused();
	await day.press('ArrowUp');
	await expect(page.getByTestId('date-value')).toHaveText('2026-01-06');
	await day.press('Backspace');
	await expect(page.getByTestId('date-value')).toBeEmpty();
	await page.getByRole('button', { name: 'Invia', exact: true }).click();
	await expect(page.getByTestId('submitted')).toBeEmpty();
	await expect(day).toBeFocused();
	await day.press('1');
	await day.press('2');
	await expect(page.getByTestId('date-value')).toHaveText('2026-01-12');
	await expect(page.getByRole('button', { name: 'Apri calendario' }).nth(2)).toBeDisabled();
});

test('calendario usabile dentro un dialog anche su mobile', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 812 });
	await page.getByRole('button', { name: 'Dialog', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Selezione nel dialog' });
	await dialog.getByRole('button', { name: 'Apri calendario' }).click();
	await page.locator('[data-calendar-day][data-value="2026-01-20"]').click();
	await expect(page.locator('#dialog-date-field')).toHaveText('20/01/2026');
	await expect(dialog).toBeVisible();
	await expect(page.getByTestId('date-value')).toHaveText('2026-01-20');
});

for (const [button, endpoint] of [
	['Inserimento collaboratore', '/api/v1/staff-attendance'],
	['Inserimento corsista', '/api/v1/attendance/manual']
]) {
	test(`${button}: calendario e payload data/ora`, async ({ page }) => {
		await page.route(`**${endpoint}`, (route) => route.fulfill({ json: { success: true } }));
		await page.getByRole('button', { name: button, exact: true }).click();
		const dialog = page.getByRole('dialog');
		const field = dialog.locator('[data-date-field-input]');
		await expect(field).toHaveText(/^\d{2}\/\d{2}\/\d{4}$/);
		await dialog.getByRole('button', { name: 'Apri calendario' }).click();
		await dialog
			.locator('[data-calendar-day]:not([data-outside-month])')
			.filter({ hasText: /^15$/ })
			.click();
		await dialog.getByRole('textbox', { name: 'Ora (formato 24 ore)' }).fill('08:25');
		const display = await field.textContent();
		const request = page.waitForRequest(
			(request) => request.url().endsWith(endpoint) && request.method() === 'POST'
		);
		await dialog.getByRole('button', { name: 'Inserisci', exact: true }).click();
		const payload = (await request).postDataJSON();
		const [day, month, year] = display!.split('/');
		expect(payload.readTimestamp).toBe(`${year}-${month}-${day}T08:25`);
		await expect(dialog).not.toBeVisible();
	});
}

test('esportazione: entrambi i picker, range valido e query ISO', async ({ page }) => {
	await page.route('**/api/v1/attendance/export?*', (route) => route.fulfill({ status: 204 }));
	await page.getByRole('button', { name: 'Esportazione', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await expect(page.locator('#export-from-field')).toHaveText('05/01/2026');
	await expect(page.locator('#export-to-field')).toHaveText('31/01/2026');
	await dialog.getByRole('button', { name: 'Apri calendario' }).first().click();
	await dialog.locator('[data-calendar-day][data-value="2026-01-12"]').click();
	await expect(dialog.locator('[data-calendar-day]')).toHaveCount(0);
	await dialog.getByRole('button', { name: 'Apri calendario' }).last().click();
	await dialog.locator('[data-calendar-day][data-value="2026-01-20"]').click();
	const request = page.waitForRequest('**/api/v1/attendance/export?*');
	await dialog.getByRole('button', { name: 'Esporta', exact: true }).click();
	const url = new URL((await request).url());
	expect(url.searchParams.get('from')).toBe('2026-01-12');
	expect(url.searchParams.get('to')).toBe('2026-01-20');
});

test('riepilogo ore: date complete, orari Roma e filtri', async ({ page }) => {
	const hours = page.getByTestId('hours');
	await expect(hours).toContainText('05/01/2026 – 31/01/2026');
	await expect(hours.getByRole('cell', { name: '05/01/2026 13:00', exact: true })).toBeVisible();
	await expect(page.locator('#hours-from-field')).toHaveText('05/01/2026');
	await expect(page.locator('#hours-to-field')).toHaveText('31/01/2026');
	await hours.getByRole('button', { name: 'Apri calendario' }).first().click();
	await page.locator('[data-calendar-day][data-value="2026-01-10"]').click();
	expect(
		await hours
			.locator('form')
			.evaluate((form: HTMLFormElement) => Object.fromEntries(new FormData(form)))
	).toEqual({ from: '2026-01-10', to: '2026-01-31' });
});
