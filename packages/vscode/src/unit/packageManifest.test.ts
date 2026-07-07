import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, test } from 'node:test';

interface MenuContribution {
	readonly command?: unknown;
}

interface PackageManifest {
	readonly contributes?: {
		readonly commands?: readonly MenuContribution[];
		readonly menus?: Record<string, readonly MenuContribution[]>;
	};
}

function readPackageManifest(): PackageManifest {
	const packageJsonPath = path.resolve(__dirname, '../../package.json');
	return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as PackageManifest;
}

describe('package manifest contributions', () => {
	test('does not show bootstrap as a candidates view title button', () => {
		const manifest = readPackageManifest();
		const viewTitle = manifest.contributes?.menus?.['view/title'] ?? [];

		assert.equal(
			viewTitle.some(item => item.command === 'sundial.bootstrap'),
			false,
		);
	});

	test('declares the Sundial open spec command without extension dependencies', () => {
		const manifest = readPackageManifest();
		const commands = manifest.contributes?.commands ?? [];

		assert.equal(Object.hasOwn(manifest, 'extensionDependencies'), false);
		assert.equal(
			commands.some(item => item.command === 'sundial.specs.openSpec'),
			true,
		);
	});
});
