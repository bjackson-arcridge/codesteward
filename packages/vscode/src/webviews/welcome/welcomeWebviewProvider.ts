import * as vscode from 'vscode';
import { renderWebviewHtml } from '../shared/csp.js';
import { attachMessageRouter, type MessageRouter } from '../shared/messageRouter.js';
import { type HostToWebview, type WebviewToHost, isWebviewToHost, type WelcomeState } from './messages.js';

export interface WelcomeServices {
	readonly getState: () => Promise<WelcomeState>;
	readonly diagnosticsEnabled?: () => boolean;
	readonly onCommand: (message: WebviewToHost) => void | Promise<void>;
}

export class WelcomeWebviewProvider implements vscode.WebviewViewProvider {
	private readonly routers = new Set<MessageRouter<WebviewToHost, HostToWebview>>();

	constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly services: WelcomeServices,
	) {}

	async resolveWebviewView(view: vscode.WebviewView): Promise<void> {
		view.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.extensionUri],
		};
		view.webview.html = renderWebviewHtml({
			title: 'CodeSteward',
			bodyTagId: 'cs-welcome-app',
			scriptUri: view.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webviews', 'welcome.js')),
			codiconUri: view.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'codicon.css')),
			cspSource: view.webview.cspSource,
			initialState: await this.buildState(),
			fallbackText: 'Loading CodeSteward...',
		});

		const router = attachMessageRouter<WebviewToHost, HostToWebview>(
			view.webview,
			isWebviewToHost,
			message => {
				if (message.kind === 'requestRefresh') {
					void this.refresh();
					return;
				}

				void this.services.onCommand(message);
			},
		);
		this.routers.add(router);
		view.onDidDispose(() => {
			router.dispose();
			this.routers.delete(router);
		});
	}

	async refresh(): Promise<void> {
		const message = await this.buildState();
		for (const router of this.routers) {
			router.post(message);
		}
	}

	toggleAgentForDiagnostics(agent: 'claude' | 'codex', selected: boolean): void {
		for (const router of this.routers) {
			router.post({ kind: 'diagnosticToggleAgent', agent, selected });
		}
	}

	clickInitForDiagnostics(): void {
		for (const router of this.routers) {
			router.post({ kind: 'diagnosticInit' });
		}
	}

	private async buildState(): Promise<HostToWebview> {
		const state = await this.services.getState();
		const diagnosticsEnabled = this.services.diagnosticsEnabled?.() === true;
		return {
			kind: 'state',
			state,
			...(diagnosticsEnabled ? { diagnosticsEnabled } : {}),
		};
	}
}
