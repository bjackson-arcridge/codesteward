import * as vscode from 'vscode';
import { renderWebviewHtml } from '../shared/csp.js';
import { attachMessageRouter, type MessageRouter } from '../shared/messageRouter.js';
import { type BootstrapProvider, type CandidateSummary, type HostToWebview, type WebviewToHost, isWebviewToHost } from './messages.js';

export interface CandidatesServices {
	readonly listCandidates: () => Promise<readonly CandidateSummary[]>;
	readonly listInstalledProviders: () => Promise<readonly BootstrapProvider[]>;
	readonly hasAcceptedRecords: () => Promise<boolean>;
	readonly diagnosticsEnabled?: () => boolean;
	readonly onCommand: (message: WebviewToHost) => void | Promise<void>;
}

export class CandidatesWebviewProvider implements vscode.WebviewViewProvider {
	private readonly routers = new Set<MessageRouter<WebviewToHost, HostToWebview>>();

	constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly services: CandidatesServices,
	) {}

	async resolveWebviewView(view: vscode.WebviewView): Promise<void> {
		view.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.extensionUri],
		};
		view.webview.html = renderWebviewHtml({
			title: 'Candidates',
			bodyTagId: 'cs-candidates-app',
			scriptUri: view.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webviews', 'candidates.js')),
			codiconUri: view.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'codicon.css')),
			cspSource: view.webview.cspSource,
			initialState: await this.buildState(),
			fallbackText: 'Loading Candidates...',
		});

		const router = attachMessageRouter<WebviewToHost, HostToWebview>(
			view.webview,
			isWebviewToHost,
			message => this.services.onCommand(message),
		);
		this.routers.add(router);
		view.onDidDispose(() => {
			router.dispose();
			this.routers.delete(router);
		});
	}

	async refresh(): Promise<void> {
		const state = await this.buildState();
		for (const router of this.routers) {
			router.post(state);
		}
	}

	clickCandidateForDiagnostics(id: string, target: 'title'): void {
		for (const router of this.routers) {
			router.post({ kind: 'diagnosticClickCandidate', id, target });
		}
	}

	selectProviderForDiagnostics(provider: BootstrapProvider): void {
		for (const router of this.routers) {
			router.post({ kind: 'diagnosticSelectProvider', provider });
		}
	}

	private async buildState(): Promise<HostToWebview> {
		const [candidates, installedProviders, hasAcceptedRecords] = await Promise.all([
			this.services.listCandidates(),
			this.services.listInstalledProviders(),
			this.services.hasAcceptedRecords(),
		]);
		const diagnosticsEnabled = this.services.diagnosticsEnabled?.() === true;
		return {
			kind: 'state',
			candidates,
			installedProviders,
			hasAcceptedRecords,
			...(diagnosticsEnabled ? { diagnosticsEnabled } : {}),
		};
	}
}
