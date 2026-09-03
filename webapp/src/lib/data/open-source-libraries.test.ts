import { describe, expect, it } from 'vitest';
import packageJson from '../../../package.json';
import { openSourceLibraryGroups } from './open-source-libraries';

describe('open source library credits', () => {
	it('covers every direct webapp dependency', () => {
		const creditedPackages = new Set(
			openSourceLibraryGroups.flatMap((group) =>
				group.libraries.flatMap((library) => library.packages ?? [])
			)
		);
		const directPackages = [
			...Object.keys(packageJson.dependencies),
			...Object.keys(packageJson.devDependencies)
		];

		expect(directPackages.filter((packageName) => !creditedPackages.has(packageName))).toEqual([]);
	});
});
