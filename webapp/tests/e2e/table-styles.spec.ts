import { expect, test } from '@playwright/test';

// Run against the Vite dev server, as configured in playwright.config.ts.
// Mount only UI components: no authenticated account or database mutations needed.
for (const dark of [false, true]) {
	test(`shared table appearance (${dark ? 'dark' : 'light'})`, async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.goto('/login');
		await page.getByRole('button', { name: 'Accedi', exact: true }).waitFor();
		await page.evaluate(async (dark) => {
			const runtimePath = '/node_modules/.vite/deps/svelte.js';
			const fixturePath = '/src/lib/components/ui/table/__fixtures__/Tables.svelte';
			const { mount } = await import(runtimePath);
			const { default: Fixture } = await import(fixturePath);
			document.body.replaceChildren();
			document.documentElement.classList.toggle('dark', dark);
			mount(Fixture, { target: document.body });
		}, dark);

		const tables = page.locator('[data-slot="table"]');
		await expect(tables).toHaveCount(3);
		const appearance = await tables.evaluateAll((elements) =>
			elements.slice(0, 2).map((table) => {
				const head = getComputedStyle(table.querySelector('th')!);
				const cells = [...table.querySelectorAll('tbody tr td:first-child')];
				return {
					header: { height: head.height, padding: head.padding, weight: head.fontWeight },
					rows: cells.map((cell) => {
						const style = getComputedStyle(cell);
						return {
							background: style.backgroundColor,
							height: style.height,
							padding: style.padding
						};
					})
				};
			})
		);
		expect(appearance[0]).toEqual(appearance[1]);
		expect(appearance[0].rows[0].background).not.toEqual(appearance[0].rows[1].background);
		expect(appearance[0].rows[2].background).not.toEqual(appearance[0].rows[1].background);

		const firstCell = tables.first().locator('tbody td').first();
		await firstCell.hover();
		await expect
			.poll(() => firstCell.evaluate((el) => getComputedStyle(el).backgroundColor))
			.not.toBe(appearance[0].rows[0].background);
		const selected = tables.first().locator('[data-state="selected"] td').first();
		await selected.hover();
		await expect
			.poll(() => selected.evaluate((el) => getComputedStyle(el).backgroundColor))
			.toBe(appearance[0].rows[2].background);

		const frames = page.locator(
			'[data-slot="table-panel"], [data-slot="table-container"]:not([data-embedded="true"])'
		);
		const borders = await frames.evaluateAll((elements) =>
			elements.map((el) => {
				const style = getComputedStyle(el);
				return { border: style.borderWidth, radius: style.borderRadius };
			})
		);
		expect(borders.every((border) => JSON.stringify(border) === JSON.stringify(borders[0]))).toBe(
			true
		);
		await expect(page.locator('[data-embedded="true"]')).toHaveCSS('border-width', '0px');
		await expect(page.locator('[data-empty]')).toHaveCSS('text-align', 'center');

		await page.setViewportSize({ width: 320, height: 800 });
		await expect(page.locator('[data-slot="table-container"]').first()).toHaveCSS(
			'overflow-x',
			'auto'
		);
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
			true
		);
		expect(
			await page
				.locator('[data-slot="table-container"]')
				.first()
				.evaluate((el) => {
					el.scrollLeft = 100;
					return el.scrollWidth > el.clientWidth && el.scrollLeft > 0;
				})
		).toBe(true);
	});
}
