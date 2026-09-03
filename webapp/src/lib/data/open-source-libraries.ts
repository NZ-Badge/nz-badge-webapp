export interface OpenSourceLibrary {
	name: string;
	license: string;
	url: string;
	packages?: string[];
}

export interface OpenSourceLibraryGroup {
	name: string;
	libraries: OpenSourceLibrary[];
}

export const openSourceLibraryGroups: OpenSourceLibraryGroup[] = [
	{
		name: 'Applicazione web',
		libraries: [
			{
				name: 'Svelte e SvelteKit',
				license: 'MIT',
				url: 'https://svelte.dev/',
				packages: [
					'svelte',
					'@sveltejs/kit',
					'@sveltejs/adapter-node',
					'@sveltejs/vite-plugin-svelte'
				]
			},
			{
				name: 'Tailwind CSS',
				license: 'MIT',
				url: 'https://tailwindcss.com/',
				packages: ['tailwindcss', '@tailwindcss/vite']
			},
			{
				name: 'shadcn-svelte',
				license: 'MIT',
				url: 'https://www.shadcn-svelte.com/'
			},
			{
				name: 'Bits UI',
				license: 'MIT',
				url: 'https://bits-ui.com/',
				packages: ['bits-ui']
			},
			{
				name: 'Lucide Icons',
				license: 'ISC',
				url: 'https://lucide.dev/',
				packages: ['@lucide/svelte', 'lucide-svelte']
			},
			{ name: 'Zod', license: 'MIT', url: 'https://zod.dev/', packages: ['zod'] },
			{
				name: 'Drizzle ORM',
				license: 'Apache-2.0',
				url: 'https://orm.drizzle.team/',
				packages: ['drizzle-orm']
			},
			{
				name: 'MySQL2',
				license: 'MIT',
				url: 'https://sidorares.github.io/node-mysql2/',
				packages: ['mysql2']
			},
			{
				name: 'bcrypt.js',
				license: 'BSD-3-Clause',
				url: 'https://github.com/dcodeIO/bcrypt.js',
				packages: ['bcryptjs']
			},
			{
				name: 'jose',
				license: 'MIT',
				url: 'https://github.com/panva/jose',
				packages: ['jose']
			},
			{
				name: 'date-fns e date-fns-tz',
				license: 'MIT',
				url: 'https://date-fns.org/',
				packages: ['date-fns', 'date-fns-tz']
			},
			{
				name: 'Nodemailer',
				license: 'MIT-0',
				url: 'https://nodemailer.com/',
				packages: ['nodemailer']
			},
			{
				name: 'Node Cron',
				license: 'ISC',
				url: 'https://nodecron.com/',
				packages: ['node-cron']
			},
			{
				name: 'Adobe Internationalized Date',
				license: 'Apache-2.0',
				url: 'https://react-spectrum.adobe.com/internationalized/date/',
				packages: ['@internationalized/date']
			},
			{
				name: 'clsx',
				license: 'MIT',
				url: 'https://github.com/lukeed/clsx',
				packages: ['clsx']
			},
			{
				name: 'tailwind-merge',
				license: 'MIT',
				url: 'https://github.com/dcastil/tailwind-merge',
				packages: ['tailwind-merge']
			},
			{
				name: 'Tailwind Variants',
				license: 'MIT',
				url: 'https://www.tailwind-variants.org/',
				packages: ['tailwind-variants']
			},
			{
				name: 'tw-animate-css',
				license: 'MIT',
				url: 'https://github.com/Wombosvideo/tw-animate-css',
				packages: ['tw-animate-css']
			},
			{
				name: 'Vite PWA for SvelteKit',
				license: 'MIT',
				url: 'https://github.com/vite-pwa/sveltekit',
				packages: ['@vite-pwa/sveltekit']
			}
		]
	},
	{
		name: 'Sviluppo e qualità',
		libraries: [
			{ name: 'Vite', license: 'MIT', url: 'https://vite.dev/', packages: ['vite'] },
			{
				name: 'TypeScript',
				license: 'Apache-2.0',
				url: 'https://www.typescriptlang.org/',
				packages: ['typescript']
			},
			{ name: 'tsx', license: 'MIT', url: 'https://tsx.is/', packages: ['tsx'] },
			{
				name: 'Drizzle Kit',
				license: 'MIT',
				url: 'https://orm.drizzle.team/kit-docs/overview',
				packages: ['drizzle-kit']
			},
			{
				name: 'Svelte Check',
				license: 'MIT',
				url: 'https://github.com/sveltejs/language-tools',
				packages: ['svelte-check']
			},
			{
				name: 'ESLint e integrazioni',
				license: 'MIT',
				url: 'https://eslint.org/',
				packages: [
					'eslint',
					'@eslint/js',
					'eslint-config-prettier',
					'eslint-plugin-svelte',
					'globals',
					'typescript-eslint'
				]
			},
			{
				name: 'Prettier e plugin Svelte',
				license: 'MIT',
				url: 'https://prettier.io/',
				packages: ['prettier', 'prettier-plugin-svelte']
			},
			{
				name: 'Vitest',
				license: 'MIT',
				url: 'https://vitest.dev/',
				packages: ['vitest']
			},
			{
				name: 'Playwright',
				license: 'Apache-2.0',
				url: 'https://playwright.dev/',
				packages: ['@playwright/test']
			},
			{
				name: 'DefinitelyTyped',
				license: 'MIT',
				url: 'https://github.com/DefinitelyTyped/DefinitelyTyped',
				packages: ['@types/bcryptjs', '@types/nodemailer']
			}
		]
	},
	{
		name: 'Firmware embedded',
		libraries: [
			{
				name: 'Arduino Core for ESP32',
				license: 'LGPL-2.1-or-later',
				url: 'https://github.com/espressif/arduino-esp32'
			},
			{ name: 'ArduinoJson', license: 'MIT', url: 'https://arduinojson.org/' },
			{
				name: 'Adafruit PN532',
				license: 'BSD-3-Clause',
				url: 'https://github.com/adafruit/Adafruit-PN532'
			},
			{
				name: 'Adafruit BusIO',
				license: 'MIT',
				url: 'https://github.com/adafruit/Adafruit_BusIO'
			},
			{
				name: 'U8g2',
				license: 'BSD-2-Clause',
				url: 'https://github.com/olikraus/u8g2'
			},
			{
				name: 'ArduinoHttpClient',
				license: 'Apache-2.0',
				url: 'https://github.com/arduino-libraries/ArduinoHttpClient'
			},
			{
				name: 'WiFiManager',
				license: 'MIT',
				url: 'https://github.com/tzapu/WiFiManager'
			},
			{
				name: 'Adafruit NeoPixel',
				license: 'LGPL-3.0',
				url: 'https://github.com/adafruit/Adafruit_NeoPixel'
			}
		]
	}
];
