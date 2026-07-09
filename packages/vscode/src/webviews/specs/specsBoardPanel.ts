import * as vscode from 'vscode';
import { renderWebviewHtml } from '../shared/csp.js';
import { attachMessageRouter, type MessageRouter } from '../shared/messageRouter.js';
import { type HostToWebview, type SpecCard, type WebviewToHost, isWebviewToHost } from './messages.js';

export interface SpecsBoardState {
	readonly lanes: readonly string[];
	readonly specs: readonly SpecCard[];
	readonly workspaces?: readonly string[];
}

export interface SpecsBoardServices {
	readonly getState: () => Promise<SpecsBoardState>;
	readonly diagnosticsEnabled?: () => boolean;
	readonly onCommand: (message: WebviewToHost) => void | Promise<void>;
}

export class SpecsBoardPanel implements vscode.Disposable {
	private panel?: vscode.WebviewPanel;
	private router?: MessageRouter<WebviewToHost, HostToWebview>;

	constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly services: SpecsBoardServices,
	) {}

	async reveal(): Promise<void> {
		if (this.panel !== undefined) {
			this.panel.reveal(vscode.ViewColumn.One);
			await this.refresh();
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			'sundial.specs.board',
			'Specs Board',
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				localResourceRoots: [this.extensionUri],
				retainContextWhenHidden: true,
			},
		);
		this.panel = panel;
		panel.webview.html = renderWebviewHtml({
			title: 'Specs Board',
			bodyTagId: 'cs-specs-board-app',
			scriptUri: panel.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webviews', 'specs.js')),
			codiconUri: panel.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'codicon.css')),
			cspSource: panel.webview.cspSource,
			initialState: await this.buildState(),
			fallbackText: 'Loading Specs...',
		});

		this.router = attachMessageRouter<WebviewToHost, HostToWebview>(
			panel.webview,
			isWebviewToHost,
			message => this.services.onCommand(message),
		);
		panel.onDidDispose(() => {
			this.router?.dispose();
			this.router = undefined;
			this.panel = undefined;
		});
	}

	async refresh(): Promise<void> {
		if (this.router === undefined) {
			return;
		}

		this.router.post(await this.buildState());
	}

	clickSpecForDiagnostics(id: string, target: 'open' | 'worktree' | 'archive' | 'delete', workspace?: string): void {
		this.router?.post({
			kind: 'diagnosticClickSpec',
			id,
			target,
			...(workspace === undefined ? {} : { workspace }),
		});
	}

	createSpecForDiagnostics(title: string, status: string, workspace?: string): void {
		this.router?.post({
			kind: 'diagnosticCreateSpec',
			title,
			status,
			...(workspace === undefined ? {} : { workspace }),
		});
	}

	moveSpecForDiagnostics(id: string, status: string, workspace?: string): void {
		this.router?.post({
			kind: 'diagnosticMoveSpec',
			id,
			status,
			...(workspace === undefined ? {} : { workspace }),
		});
	}

	deleteSpecForDiagnostics(id: string, workspace?: string): void {
		this.router?.post({
			kind: 'diagnosticDeleteSpec',
			id,
			...(workspace === undefined ? {} : { workspace }),
		});
	}

	dispose(): void {
		this.router?.dispose();
		this.router = undefined;
		this.panel?.dispose();
		this.panel = undefined;
	}

	private async buildState(): Promise<HostToWebview> {
		const state = await this.services.getState();
		const diagnosticsEnabled = this.services.diagnosticsEnabled?.() === true;
		return {
			kind: 'state',
			lanes: state.lanes,
			specs: state.specs,
			...(state.workspaces === undefined ? {} : { workspaces: state.workspaces }),
			...(diagnosticsEnabled ? { diagnosticsEnabled } : {}),
		};
	}
}
