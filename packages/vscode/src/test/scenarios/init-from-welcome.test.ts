import * as assert from 'assert';
import * as vscode from 'vscode';

import {
	activateExtension,
	focusWelcomeView,
	type ExtensionDiagnostics,
	useLocalCodeStewardCli,
	wait,
} from './shared/helpers';

interface ExpectedRender {
	readonly cliAvailable?: boolean;
	readonly claudeSelected?: boolean;
	readonly codexSelected?: boolean;
	readonly initDisabled?: boolean;
}

suite('Scenario: init-from-welcome', () => {
	test('welcome view renders agent harness checkboxes with init disabled by default', async () => {
		await activateExtension();
		await focusWelcomeView();

		const diagnostics = await waitForWelcomeRender({
			claudeSelected: false,
			codexSelected: false,
		});

		assert.equal(diagnostics.welcomeLastRendered?.claudeSelected, false);
		assert.equal(diagnostics.welcomeLastRendered?.codexSelected, false);
		assert.equal(diagnostics.welcomeLastRendered?.initDisabled, true);
		assert.equal(diagnostics.activeCandidateCount, 0);
		assert.equal(diagnostics.acceptedRecordCount, 0);
	});

	test('toggling checkboxes flips selection and gates the init button when CLI is available', async () => {
		await useLocalCodeStewardCli();
		await activateExtension();
		await focusWelcomeView();

		await waitForWelcomeRender({ cliAvailable: true, initDisabled: true });

		await vscode.commands.executeCommand('codesteward.internal.welcome.toggleAgent', 'claude', true);
		await waitForWelcomeRender({
			cliAvailable: true,
			claudeSelected: true,
			codexSelected: false,
			initDisabled: false,
		});

		await vscode.commands.executeCommand('codesteward.internal.welcome.toggleAgent', 'codex', true);
		await waitForWelcomeRender({
			cliAvailable: true,
			claudeSelected: true,
			codexSelected: true,
			initDisabled: false,
		});

		await vscode.commands.executeCommand('codesteward.internal.welcome.toggleAgent', 'claude', false);
		await waitForWelcomeRender({
			cliAvailable: true,
			claudeSelected: false,
			codexSelected: true,
			initDisabled: false,
		});

		await vscode.commands.executeCommand('codesteward.internal.welcome.toggleAgent', 'codex', false);
		await waitForWelcomeRender({
			cliAvailable: true,
			claudeSelected: false,
			codexSelected: false,
			initDisabled: true,
		});
	});

	test('clicking init dispatches the init command with the selected agent flags', async () => {
		await useLocalCodeStewardCli();
		await activateExtension();
		await focusWelcomeView();

		await waitForWelcomeRender({ cliAvailable: true });

		await vscode.commands.executeCommand('codesteward.internal.welcome.toggleAgent', 'claude', true);
		await waitForWelcomeRender({
			cliAvailable: true,
			claudeSelected: true,
			codexSelected: false,
			initDisabled: false,
		});

		await vscode.commands.executeCommand('codesteward.internal.welcome.click');
		const dispatched = await waitForWelcomeInitCommand();

		assert.equal(dispatched.kind, 'init');
		assert.equal(dispatched.claude, true);
		assert.equal(dispatched.codex, false);
	});
});

async function waitForWelcomeRender(
	expected: ExpectedRender,
	timeoutMs = 10000,
): Promise<ExtensionDiagnostics> {
	const started = Date.now();
	let last: ExtensionDiagnostics | undefined;

	while (Date.now() - started < timeoutMs) {
		await focusWelcomeView();
		last = await vscode.commands.executeCommand<ExtensionDiagnostics>('codesteward.internal.webviewDiagnostics');
		const rendered = last.welcomeLastRendered;
		if (
			rendered !== undefined
			&& (expected.cliAvailable === undefined || rendered.cliAvailable === expected.cliAvailable)
			&& (expected.claudeSelected === undefined || rendered.claudeSelected === expected.claudeSelected)
			&& (expected.codexSelected === undefined || rendered.codexSelected === expected.codexSelected)
			&& (expected.initDisabled === undefined || rendered.initDisabled === expected.initDisabled)
		) {
			return last;
		}

		await wait(100);
	}

	throw new Error(`Timed out waiting for welcome render: ${JSON.stringify({ expected, last })}`);
}

interface DispatchedInitCommand {
	readonly kind: string;
	readonly claude?: boolean;
	readonly codex?: boolean;
}

async function waitForWelcomeInitCommand(timeoutMs = 5000): Promise<DispatchedInitCommand> {
	const started = Date.now();
	let last: ExtensionDiagnostics | undefined;

	while (Date.now() - started < timeoutMs) {
		last = await vscode.commands.executeCommand<ExtensionDiagnostics>('codesteward.internal.webviewDiagnostics');
		const command = last.welcomeLastCommand;
		if (command !== undefined && command.kind === 'init') {
			return command;
		}

		await wait(100);
	}

	throw new Error(`Timed out waiting for welcome init command dispatch: ${JSON.stringify(last)}`);
}
