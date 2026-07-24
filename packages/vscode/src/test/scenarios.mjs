// Single source of truth for integration test scenarios.
// Both prepare-workspaces.mjs and .vscode-test.mjs consume this list so
// adding a scenario only requires (1) a new entry here and (2) a fixture
// directory under src/test/fixtures/states/<label>.

import * as os from 'node:os';
import * as path from 'node:path';

// Workspaces live outside the monorepo so an uninitialized scenario does not
// inherit the repo's ancestor `sundial` store via discovery walk-up.
export const workspacesRoot = path.join(os.tmpdir(), 'cs-it-ws');

export const scenarios = [
	{
		label: 'records-and-candidates',
		description: 'Records and candidates webviews render seeded fixture state.',
	},
	{
		label: 'init-from-welcome',
		description: 'Welcome webview drives the agent-selection init flow on an uninitialized workspace.',
	},
];
