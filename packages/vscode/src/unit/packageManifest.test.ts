import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, test } from 'node:test';

interface MenuContribution {
	readonly command?: unknown;
}

interface PackageManifest {
	readonly version?: string;
	readonly scripts?: Record<string, string>;
	readonly contributes?: {
		readonly commands?: readonly MenuContribution[];
		readonly views?: Record<string, readonly { readonly id?: string; readonly type?: string; readonly when?: string }[]>;
		readonly configuration?: {
			readonly properties?: Record<string, { readonly type?: string; readonly default?: unknown; readonly scope?: string; readonly description?: string }>;
		};
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
	test('contributes one initialized Sundial sidebar webview', () => {
		const manifest = readPackageManifest();
		const views = manifest.contributes?.views?.sundial ?? [];
		const initializedViews = views.filter(view => view.when === 'sundial.workspaceInitialized');

		assert.equal(manifest.version, '0.7.4');
		assert.deepEqual(initializedViews, [{
			id: 'sundial.main',
			name: 'Sundial',
			type: 'webview',
			when: 'sundial.workspaceInitialized',
		}]);
	});

	test('does not contribute the removed bootstrap feature', () => {
		const manifest = readPackageManifest();
		const commands = manifest.contributes?.commands ?? [];
		const viewTitle = manifest.contributes?.menus?.['view/title'] ?? [];

		assert.equal(
			commands.some(item => item.command === 'sundial.bootstrap'),
			false,
		);
		assert.equal(
			viewTitle.some(item => item.command === 'sundial.bootstrap'),
			false,
		);
		assert.doesNotMatch(readExtensionSource(), /registerCommand\('sundial\.bootstrap'/);
	});

	test('declares Sundial spec commands without extension dependencies', () => {
		const manifest = readPackageManifest();
		const commands = manifest.contributes?.commands ?? [];
		const viewTitle = manifest.contributes?.menus?.['view/title'] ?? [];

		assert.equal(Object.hasOwn(manifest, 'extensionDependencies'), false);
		assert.equal(
			commands.some(item => item.command === 'sundial.specs.customizeTemplate'),
			true,
		);
		assert.equal(
			commands.some(item => item.command === 'sundial.specs.openSpec'),
			true,
		);
		assert.equal(
			commands.some(item => item.command === 'sundial.specs.openBoard'),
			true,
		);
		assert.equal(
			commands.some(item => item.command === 'sundial.specs.spawnWorktree'),
			true,
		);
		assert.equal(
			commands.some(item => item.command === 'sundial.specs.plan'),
			true,
		);
		assert.equal(
			commands.some(item => item.command === 'sundial.specs.implement'),
			true,
		);
		assert.equal(
			commands.some(item => item.command === 'sundial.specs.review'),
			true,
		);
		assert.equal(
			viewTitle.some(item => item.command === 'sundial.specs.openBoard'),
			false,
		);
	});

	test('routes spec sidebar and board moves through the CLI status command', () => {
		const source = readExtensionSource();

		assert.match(source, /if \(message\.kind === 'moveSpec'\) {\s*await moveSpec\(message\.id, message\.status, message\.workspace, specsProvider, specsBoardPanel\);/);
		assert.match(source, /if \(message\.kind === 'move'\) {\s*await moveSpec\(message\.id, message\.status, message\.workspace, specsProvider, specsBoardPanel\);/);
		assert.match(source, /if \(message\.kind === 'specWorktreeAction'\) {\s*await handleSpecWorktreeAction\(message\.action, message\.id, message\.workspace, specsProvider, specsBoardPanel\);/);
		assert.match(source, /if \(message\.kind === 'worktreeAction'\) {\s*await handleSpecWorktreeAction\(message\.action, message\.id, message\.workspace, specsProvider, specsBoardPanel\);/);
		assert.match(source, /if \(message\.kind === 'createSpec'\) {\s*await createSpec\(message\.title, message\.status, message\.workspace, specsProvider, specsBoardPanel\);/);
		assert.match(source, /if \(message\.kind === 'openSpecTemplate'\) {\s*await openSpecTemplate\(message\.workspace\);/);
		assert.match(source, /const templatePath = path\.join\(root, 'sundial', 'templates', 'spec\.md'\);/);
		assert.match(source, /await runSundial\(root, sundialCliSpecTemplateArgs\(\)\);/);
		assert.match(source, /await openMarkdownSource\(templatePath\);/);
		assert.match(source, /if \(message\.kind === 'deleteSpec'\) {\s*await deleteSpec\(message\.id, message\.workspace, specsProvider, specsBoardPanel, message\.skipConfirmation === true\);/);
		assert.match(source, /const output = await runSundial\(root, \['spec', 'create', '--title', title, '--status', status\]\);/);
		assert.match(source, /await openMarkdownSource\(createdPath\);/);
		assert.match(source, /stores\.map\(store => listSpecLanes\(store\.root\)\)/);
		assert.match(source, /await runLifecycle\(record\.id, \['spec', 'status', record\.id, status\], filePath\);/);
		assert.match(source, /vscode\.commands\.executeCommand\('vscode\.openFolder', vscode\.Uri\.file\(state\.worktreePath\), \{ forceNewWindow: true \}\)/);
		assert.match(source, /\['worktree', 'create', record\.id, '--json'\]/);
		assert.match(source, /\['worktree', 'preflight', specId, '--json'\]/);
		assert.doesNotMatch(source, /frontmatter[\s\S]{0,120}message\.status/);
	});

	test('routes spec phase launch commands through official provider extensions', () => {
		const source = readExtensionSource();

		assert.match(source, /registerCommand\('sundial\.specs\.plan', \(id\?: string\) => launchSpecSession\('planning', id\)\)/);
		assert.match(source, /registerCommand\('sundial\.specs\.implement', \(id\?: string\) => launchSpecSession\('implementation', id\)\)/);
		assert.match(source, /registerCommand\('sundial\.specs\.review', \(id\?: string\) => launchSpecSession\('review', id\)\)/);
		assert.match(source, /if \(message\.kind === 'launchSpec'\) {\s*await launchSpecSession\(message\.phase, message\.id, message\.workspace\);/);
		assert.match(source, /if \(message\.kind === 'launch'\) {\s*await launchSpecSession\(message\.phase, message\.id, message\.workspace\);/);
		assert.match(source, /vscode\.extensions\.getExtension\(extensionId\)/);
		assert.match(source, /'anthropic\.claude-code'/);
		assert.match(source, /'openai\.chatgpt'/);
		assert.match(source, /vscode\.env\.openExternal\(vscode\.Uri\.parse\(uri\)\)/);
		assert.match(source, /phase !== 'implementation'/);
		assert.match(source, /vscode\.env\.clipboard\.writeText\(prompt\)/);
		assert.match(source, /vscode\.commands\.executeCommand\('chatgpt\.newCodexPanel'\)/);
		assert.match(source, /vscode\.commands\.executeCommand\('chatgpt\.implementTodo', args\)/);
	});

	test('refreshes specs views when spec markdown or workflow files change', () => {
		const source = readExtensionSource();

		assert.match(source, /createFileSystemWatcher\('\*\*\/sundial\/\{decisions,research,specs\}\/\*\*\/\*\.\{md,yml,yaml\}'\)/);
		assert.match(source, /await refreshGovernanceViews\(welcomeProvider, candidatesProvider, recordsProvider, rejectedRecordsProvider, retiredRecordsProvider, researchProvider, specsProvider\);/);
		assert.match(source, /await specsBoardPanel\.refresh\(\);/);
	});

	test('contributes a resource-scoped setting for markdown comment bubbles', () => {
		const manifest = readPackageManifest();
		const setting = manifest.contributes?.configuration?.properties?.['sundial.comments.renderInlineBubbles'];

		assert.deepEqual(setting, {
			type: 'boolean',
			default: true,
			scope: 'resource',
			description: 'Render HTML comments in Markdown files as inline chat bubbles.',
		});
	});

	test('prepares a pinned project-managed VS Code test runtime', () => {
		const manifest = readPackageManifest();
		const config = fs.readFileSync(path.resolve(__dirname, '../../../../.vscode-test.mjs'), 'utf8');
		const helper = fs.readFileSync(path.resolve(__dirname, '../../../../scripts/prepare-vscode-test-runtime.mjs'), 'utf8');

		assert.equal(manifest.scripts?.['prepare-test-runtime'], 'node ../../scripts/prepare-vscode-test-runtime.mjs');
		assert.match(manifest.scripts?.pretest ?? '', /npm run prepare-test-runtime/);
		assert.match(config, /useInstallation: \{ fromPath: vscodeTestExecutablePath \}/);
		assert.match(config, /vscodeTestVersion/);
		assert.doesNotMatch(config, /fromMachine/);
		assert.match(helper, /downloadAndUnzipVSCode/);
		assert.match(helper, /'codesign', \['--force', '--deep', '--sign', '-'/);
	});
});
