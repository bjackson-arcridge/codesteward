#!/usr/bin/env node
// Stage per-scenario integration test workspaces by overlaying a state
// snapshot onto the shared fixture code project. Each scenario gets its
// own directory under packages/vscode/.test-workspaces/<label>, which
// vscode-test opens via workspaceFolder. Run before `vscode-test`.

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { scenarios, workspacesRoot } from './scenarios.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '..', '..');
const fixturesRoot = path.join(here, 'fixtures');
const codeProjectFixture = path.join(fixturesRoot, 'code-project');
const statesFixtureRoot = path.join(fixturesRoot, 'states');

async function main() {
	await fs.rm(workspacesRoot, { recursive: true, force: true });
	await fs.mkdir(workspacesRoot, { recursive: true });

	for (const scenario of scenarios) {
		const stateRoot = path.join(statesFixtureRoot, scenario.label);
		await assertExists(stateRoot, `fixture state for scenario "${scenario.label}"`);

		const target = path.join(workspacesRoot, scenario.label);
		await fs.cp(codeProjectFixture, target, { recursive: true });
		await fs.cp(stateRoot, target, { recursive: true });
		console.log(`[prepare-workspaces] staged "${scenario.label}" -> ${path.relative(packageRoot, target)}`);
	}
}

async function assertExists(target, label) {
	try {
		await fs.access(target);
	} catch {
		throw new Error(`Missing ${label} at ${target}`);
	}
}

main().catch(error => {
	console.error('[prepare-workspaces] failed:', error);
	process.exitCode = 1;
});
