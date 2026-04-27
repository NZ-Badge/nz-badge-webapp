import type { PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
	testDir: './tests/e2e',
	use: {
		baseURL: 'http://localhost:5173'
	},
	projects: [{ name: 'chromium', use: { browserName: 'chromium' } }]
	// webServer intentionally omitted for local dev;
	// CI configuration will be added in the deployment plan
};

export default config;
