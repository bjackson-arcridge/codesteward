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

function readExtensionSource(): string {
	return fs.readFileSync(path.resolve(__dirname, '../../src/extension.ts'), 'utf8');
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
		const viewTitle = manifest.contributes?.menus?.['view/title'] ?? [];

		assert.equal(Object.hasOwn(manifest, 'extensionDependencies'), false);
		assert.equal(
			commands.some(item => item.command === 'sundial.specs.openSpec'),
			true,
		);
		assert.equal(
			commands.some(item => item.command === 'sundial.specs.openBoard'),
			true,
		);
		assert.equal(
			viewTitle.some(item => item.command === 'sundial.specs.openBoard'),
			false,
		);
	});

	test('routes spec board moves through the CLI status command', () => {
		const source = readExtensionSource();

		assert.match(source, /if \(message\.kind === 'move'\) {\s*await moveSpecFromBoard\(message\.id, message\.status, message\.workspace, specsProvider, specsBoardPanel\);/);
		assert.match(source, /await runLifecycle\(record\.id, \['spec', 'status', record\.id, status\], filePath\);/);
		assert.doesNotMatch(source, /frontmatter[\s\S]{0,120}message\.status/);
	});

	test('refreshes specs views when spec markdown or workflow files change', () => {
		const source = readExtensionSource();

		assert.match(source, /createFileSystemWatcher\('\*\*\/sundial\/\{decisions,research,specs\}\/\*\*\/\*\.\{md,yml,yaml\}'\)/);
		assert.match(source, /await refreshGovernanceViews\(welcomeProvider, candidatesProvider, recordsProvider, rejectedRecordsProvider, retiredRecordsProvider, researchProvider, specsProvider\);/);
		assert.match(source, /await specsBoardPanel\.refresh\(\);/);
	});
});
