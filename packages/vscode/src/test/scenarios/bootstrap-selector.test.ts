import * as assert from 'assert';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';

import {
	activateExtension,
	focusCandidatesView,
	type ExtensionDiagnostics,
	wait,
} from './shared/helpers';

interface ExpectedCandidatesRender {
	readonly emptyVisible?: boolean;
	readonly bootstrapAction?: 'bootstrap' | 'audit';
	readonly bootstrapProvider?: 'claude' | 'codex';
	readonly providerSelectorVisible?: boolean;
}

suite('Scenario: bootstrap-selector', () => {
	test('with no harnesses installed the audit button renders disabled with no selector', async () => {
		await ensureNoHarnesses();
		await activateExtension();
		await focusCandidatesView();
		await refreshCandidates();

		const diagnostics = await waitForCandidatesRender({
			emptyVisible: true,
			bootstrapAction: 'audit',
			providerSelectorVisible: false,
		});

		assert.equal(diagnostics.candidatesLastRendered?.bootstrapProvider, undefined);
		assert.equal(diagnostics.acceptedRecordCount, 1);
		assert.equal(diagnostics.activeCandidateCount, 0);
	});

	test('one installed harness hides the selector and dispatches that provider on click', async () => {
		await ensureClaudeOnly();
		await activateExtension();
		await focusCandidatesView();
		await refreshCandidates();

		const initial = await waitForCandidatesRender({
			emptyVisible: true,
			bootstrapAction: 'audit',
			providerSelectorVisible: false,
			bootstrapProvider: 'claude',
		});
		assert.equal(initial.candidatesLastRendered?.providerSelectorVisible, false);
	});

	test('two installed harnesses show the selector and route the chosen provider through bootstrap', async () => {
		await ensureBothHarnesses();
		await activateExtension();
		await focusCandidatesView();
		await refreshCandidates();

		await waitForCandidatesRender({
			emptyVisible: true,
			bootstrapAction: 'audit',
			providerSelectorVisible: true,
			bootstrapProvider: 'claude',
		});

		await vscode.commands.executeCommand('codesteward.internal.candidates.selectProvider', 'codex');
		await waitForCandidatesRender({
			emptyVisible: true,
			bootstrapAction: 'audit',
			providerSelectorVisible: true,
			bootstrapProvider: 'codex',
		});

		await vscode.commands.executeCommand('codesteward.internal.candidates.selectProvider', 'claude');
		await waitForCandidatesRender({
			emptyVisible: true,
			bootstrapAction: 'audit',
			providerSelectorVisible: true,
			bootstrapProvider: 'claude',
		});
	});
});

async function waitForCandidatesRender(
	expected: ExpectedCandidatesRender,
	timeoutMs = 10000,
): Promise<ExtensionDiagnostics> {
	const started = Date.now();
	let last: ExtensionDiagnostics | undefined;

	while (Date.now() - started < timeoutMs) {
		await focusCandidatesView();
		last = await vscode.commands.executeCommand<ExtensionDiagnostics>('codesteward.internal.webviewDiagnostics');
		const rendered = last.candidatesLastRendered;
		if (
			rendered !== undefined
			&& (expected.emptyVisible === undefined || rendered.emptyVisible === expected.emptyVisible)
			&& (expected.bootstrapAction === undefined || rendered.bootstrapAction === expected.bootstrapAction)
			&& (expected.bootstrapProvider === undefined || rendered.bootstrapProvider === expected.bootstrapProvider)
			&& (expected.providerSelectorVisible === undefined || rendered.providerSelectorVisible === expected.providerSelectorVisible)
		) {
			return last;
		}

		await wait(100);
	}

	throw new Error(`Timed out waiting for candidates render: ${JSON.stringify({ expected, last })}`);
}

async function refreshCandidates(): Promise<void> {
	await vscode.commands.executeCommand('codesteward.internal.candidates.refresh');
}

function workspaceRoot(): string {
	const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	if (root === undefined) {
		throw new Error('Expected scenario workspace folder to be open');
	}

	return root;
}

async function ensureNoHarnesses(): Promise<void> {
	const root = workspaceRoot();
	await fs.rm(path.join(root, '.claude'), { recursive: true, force: true });
	await fs.rm(path.join(root, 'AGENTS.md'), { force: true });
}

async function ensureClaudeOnly(): Promise<void> {
	const root = workspaceRoot();
	await fs.rm(path.join(root, 'AGENTS.md'), { force: true });
	await fs.mkdir(path.join(root, '.claude'), { recursive: true });
	await fs.writeFile(path.join(root, '.claude', 'CLAUDE.md'), '# fixture\n', 'utf8');
}

async function ensureBothHarnesses(): Promise<void> {
	await ensureClaudeOnly();
	await fs.writeFile(path.join(workspaceRoot(), 'AGENTS.md'), '# fixture\n', 'utf8');
}
