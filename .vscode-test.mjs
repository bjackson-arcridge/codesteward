import * as os from 'node:os';
import * as path from 'node:path';

import { defineConfig } from '@vscode/test-cli';

import { scenarios, workspacesRoot } from './packages/vscode/src/test/scenarios.mjs';
import { vscodeTestExecutablePath, vscodeTestVersion } from './scripts/vscode-test-runtime.mjs';
// Route VS Code user-data outside the worktree so the IPC socket path stays
// under the macOS unix-domain-socket length limit (~103 chars). The prefix
// is intentionally short — tmpdir on macOS is ~49 chars and the socket file
// itself is ~14, leaving ~40 chars for "<prefix>/<scenario-label>".
// Per-scenario subdirs also set us up for parallel runs later.
const userDataRoot = path.join(os.tmpdir(), 'cs-it');

export default defineConfig(scenarios.map(scenario => ({
	label: scenario.label,
	files: `packages/vscode/out/test/scenarios/${scenario.label}.test.js`,
	extensionDevelopmentPath: 'packages/vscode',
	version: vscodeTestVersion,
	useInstallation: { fromPath: vscodeTestExecutablePath },
	workspaceFolder: path.join(workspacesRoot, scenario.label),
	launchArgs: [
		'--disable-extensions',
		'--user-data-dir', path.join(userDataRoot, scenario.label),
	],
	mocha: {
		timeout: 20000,
	},
})));
