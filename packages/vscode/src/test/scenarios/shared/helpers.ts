import * as vscode from 'vscode';
import * as path from 'node:path';

export interface ExtensionDiagnostics {
	readonly acceptedRecordCount: number;
	readonly rejectedRecordCount: number;
	readonly retiredRecordCount: number;
	readonly activeCandidateCount: number;
	readonly specsCount: number;
	readonly recordsLastState?: {
		readonly recordCount: number;
		readonly domainFilter?: string;
	};
	readonly recordsLastRendered?: {
		readonly recordCount: number;
		readonly cardCount: number;
		readonly emptyVisible: boolean;
		readonly domainFilter?: string;
		readonly domainSelectOptionCount?: number;
	};
	readonly rejectedRecordsLastState?: {
		readonly recordCount: number;
	};
	readonly rejectedRecordsLastRendered?: {
		readonly recordCount: number;
		readonly cardCount: number;
		readonly emptyVisible: boolean;
	};
	readonly retiredRecordsLastState?: {
		readonly recordCount: number;
	};
	readonly retiredRecordsLastRendered?: {
		readonly recordCount: number;
		readonly cardCount: number;
		readonly emptyVisible: boolean;
	};
	readonly specsLastState?: {
		readonly recordCount: number;
	};
	readonly specsLastRendered?: {
		readonly recordCount: number;
		readonly cardCount: number;
		readonly emptyVisible: boolean;
		readonly groupCount?: number;
		readonly openBoardButtonVisible?: boolean;
		readonly specAddFormVisible?: boolean;
		readonly specDeleteActionCount?: number;
	};
	readonly specsBoardLastState?: {
		readonly laneCount: number;
		readonly specCount: number;
	};
	readonly specsBoardLastRendered?: {
		readonly laneCount: number;
		readonly specCount: number;
		readonly cardCount: number;
		readonly emptyVisible: boolean;
	};
	readonly candidatesLastState?: {
		readonly candidateCount: number;
	};
	readonly candidatesLastRendered?: {
		readonly candidateCount: number;
		readonly cardCount: number;
		readonly emptyVisible: boolean;
	};
	readonly welcomeLastRendered?: {
		readonly cliAvailable: boolean;
		readonly claudeSelected: boolean;
		readonly codexSelected: boolean;
		readonly initDisabled: boolean;
	};
	readonly welcomeLastCommand?: {
		readonly kind: string;
		readonly claude?: boolean;
		readonly codex?: boolean;
	};
}

export async function activateExtension(): Promise<void> {
	const extension = vscode.extensions.getExtension('arcridge.sundial');
	if (extension === undefined) {
		throw new Error('Expected Sundial VS Code extension to be loaded');
	}

	await extension.activate();
}

export async function useLocalSundialCli(): Promise<void> {
	const extension = vscode.extensions.getExtension('arcridge.sundial');
	if (extension === undefined) {
		throw new Error('Expected Sundial VS Code extension to be loaded');
	}

	const cliPath = path.resolve(extension.extensionPath, '..', 'cli', 'dist', 'main.js');
	await vscode.workspace.getConfiguration('sundial').update('cliPath', cliPath, vscode.ConfigurationTarget.Global);
}

export async function waitForWebviewDiagnostics(timeoutMs = 15000): Promise<ExtensionDiagnostics> {
	const started = Date.now();
	let last: ExtensionDiagnostics | undefined;

	while (Date.now() - started < timeoutMs) {
		await focusRecordsView();
		await focusSpecsView();
		await focusCandidatesView();
		last = await vscode.commands.executeCommand<ExtensionDiagnostics>('sundial.internal.webviewDiagnostics');
		if (
			last.recordsLastState !== undefined
			&& last.recordsLastRendered !== undefined
			&& last.specsLastState !== undefined
			&& last.specsLastRendered !== undefined
			&& last.candidatesLastState !== undefined
			&& last.candidatesLastRendered !== undefined
		) {
			return last;
		}

		await wait(100);
	}

	throw new Error(`Timed out waiting for webview diagnostics: ${JSON.stringify(last)}`);
}

export async function waitForHistoricalRecordWebviewDiagnostics(timeoutMs = 15000): Promise<ExtensionDiagnostics> {
	const started = Date.now();
	let last: ExtensionDiagnostics | undefined;

	while (Date.now() - started < timeoutMs) {
		await focusRejectedRecordsView();
		await focusRetiredRecordsView();
		last = await vscode.commands.executeCommand<ExtensionDiagnostics>('sundial.internal.webviewDiagnostics');
		if (
			last.rejectedRecordsLastState !== undefined
			&& last.rejectedRecordsLastRendered !== undefined
			&& last.retiredRecordsLastState !== undefined
			&& last.retiredRecordsLastRendered !== undefined
		) {
			return last;
		}

		await wait(100);
	}

	throw new Error(`Timed out waiting for historical record webview diagnostics: ${JSON.stringify(last)}`);
}

export async function focusWelcomeView(): Promise<void> {
	await focusView('sundial.welcome.focus');
}

export async function focusRecordsView(): Promise<void> {
	await focusView('sundial.records.focus');
}

export async function focusRejectedRecordsView(): Promise<void> {
	await focusView('sundial.records.rejected.focus');
}

export async function focusRetiredRecordsView(): Promise<void> {
	await focusView('sundial.records.retired.focus');
}

export async function focusCandidatesView(): Promise<void> {
	await focusView('sundial.candidates.focus');
}

export async function focusSpecsView(): Promise<void> {
	await focusView('sundial.specs.focus');
}

export async function waitForActiveMarkdownPreview(filePath: string, timeoutMs = 5000): Promise<vscode.Tab> {
	const started = Date.now();
	const basename = path.basename(filePath);
	const stem = path.basename(filePath, path.extname(filePath));
	let last = 'none';

	while (Date.now() - started < timeoutMs) {
		const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
		last = describeTab(tab);

		if (tab !== undefined && isMarkdownPreviewTab(tab) && (tab.label.includes(basename) || tab.label.includes(stem))) {
			return tab;
		}

		await wait(100);
	}

	throw new Error(`Timed out waiting for active markdown preview of ${basename}; last active tab was ${last}`);
}

export async function waitForActiveTextDocument(filePath: string, timeoutMs = 5000): Promise<vscode.TextEditor> {
	const started = Date.now();
	let last = 'none';

	while (Date.now() - started < timeoutMs) {
		const editor = vscode.window.activeTextEditor;
		last = editor?.document.uri.fsPath ?? 'none';

		if (editor !== undefined && path.resolve(editor.document.uri.fsPath) === path.resolve(filePath)) {
			return editor;
		}

		await wait(100);
	}

	throw new Error(`Timed out waiting for active text document ${filePath}; last active document was ${last}`);
}

function isMarkdownPreviewTab(tab: vscode.Tab): boolean {
	return tab.input instanceof vscode.TabInputWebview && tab.input.viewType.endsWith('markdown.preview');
}

function describeTab(tab: vscode.Tab | undefined): string {
	if (tab === undefined) {
		return 'none';
	}

	const input = tab.input;
	if (input instanceof vscode.TabInputWebview) {
		return `${tab.label} (${input.viewType})`;
	}

	if (input instanceof vscode.TabInputText) {
		return `${tab.label} (${input.uri.fsPath})`;
	}

	return tab.label;
}

async function focusView(command: string): Promise<void> {
	try {
		await vscode.commands.executeCommand('workbench.view.extension.sundial');
		await vscode.commands.executeCommand(command);
		await wait(50);
	} catch {
		// Contexts and contributed views can become available shortly after activation in the test host.
	}
}

export function wait(milliseconds: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, milliseconds));
}
