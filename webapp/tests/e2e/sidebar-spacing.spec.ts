import { expect, test } from '@playwright/test';

for (const width of [390, 1440]) {
	test(`sidebar tutorial outlines remain evenly separated at ${width}px`, async ({ page }) => {
		await page.setViewportSize({ width, height: 960 });
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.goto('/login');
		await page.getByRole('button', { name: 'Accedi', exact: true }).waitFor();
		await page.evaluate(async () => {
			const runtimePath = '/node_modules/.vite/deps/svelte.js';
			const layoutPath = '/src/routes/(app)/+layout.svelte';
			const { mount, createRawSnippet } = await import(runtimePath);
			const { default: Layout } = await import(layoutPath);
			// Point the isolated layout at a demo URL through the `$app/state` page object.
			const source = await (await fetch(layoutPath)).text();
			const importPath = (code: string, pattern: RegExp) => code.match(pattern)![1];
			const statePath = importPath(source, /from "([^"]*\/app\/state[^"]*)"/);
			const clientPath = importPath(
				await (await fetch(statePath)).text(),
				/from "([^"]*\/client\.js[^"]*)"/
			);
			const internalStatePath = importPath(
				await (await fetch(clientPath)).text(),
				/from "([^"]*\/client\/state\.svelte\.js[^"]*)"/
			);
			const { update } = await import(internalStatePath);
			update({
				url: new URL('/dashboard', location.origin),
				params: {},
				data: {},
				route: { id: '/(app)/dashboard' },
				status: 200,
				error: null,
				form: null,
				state: {}
			});
			localStorage.removeItem('nzbadge-tutorial-enabled');
			document.body.replaceChildren();
			mount(Layout, {
				target: document.body,
				props: {
					data: {
						user: { role: 'admin', name: 'Demo', email: 'demo@example.test' },
						version: 'test'
					},
					children: createRawSnippet(() => ({ render: () => '<p>Test navigazione</p>' }))
				}
			});
		});
		if (width < 768) await page.getByRole('button', { name: 'Apri menu di navigazione' }).click();
		const nav = page.locator('#sidebar nav');
		for (const expanded of [false, true]) {
			if (expanded) {
				await nav.locator('button').filter({ hasText: 'Ingressi' }).click();
				await nav.locator('button').filter({ hasText: 'Amministrazione' }).click();
			}
			const measure = () =>
				nav.locator('a, button').evaluateAll((elements) =>
					elements.map((el) => {
						const rect = el.getBoundingClientRect();
						const style = getComputedStyle(el);
						return {
							top: rect.top,
							bottom: rect.bottom,
							outline: parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset)
						};
					})
				);
			const before = await measure();
			await page.getByRole('button', { name: 'Attiva modalità Tutorial', exact: true }).click();
			await expect(page.locator('html')).toHaveClass(/tutorial-mode/);
			const after = await measure();
			for (let index = 1; index < after.length; index++) {
				const gap = after[index].top - after[index - 1].bottom;
				expect(gap).toBe(12);
				expect(gap - after[index].outline - after[index - 1].outline).toBeGreaterThanOrEqual(4);
				expect(gap).toBe(before[index].top - before[index - 1].bottom);
			}
			await page.getByRole('button', { name: 'Disattiva modalità Tutorial', exact: true }).click();
		}
	});
}
