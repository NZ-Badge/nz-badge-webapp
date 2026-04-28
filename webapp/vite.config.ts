import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		allowedHosts: [
			'.ddev.site',
			'.ngrok-free.app',
			'web',
			'shopify.nicolatomassoni.it',
			'rp.intessere.com',
			'rp.nicolatomassoni.it'
		]
	},
	test: {
		environment: 'node',
		include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
		globals: true
	}
});
