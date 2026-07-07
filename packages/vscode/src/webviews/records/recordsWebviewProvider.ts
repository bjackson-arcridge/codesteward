import * as vscode from 'vscode';
import { renderWebviewHtml } from '../shared/csp.js';
import { attachMessageRouter, type MessageRouter } from '../shared/messageRouter.js';
import { type HostToWebview, type WebviewToHost, isWebviewToHost, type RecordActionMode, type RecordSummary } from './messages.js';

export interface RecordFilterOptions {
	readonly domains: readonly string[];
}

export interface RecordsServices {
	readonly listRecords: () => Promise<readonly RecordSummary[]>;
	readonly listFilterOptions?: () => Promise<RecordFilterOptions>;
	readonly getDomainFilter?: () => string | undefined;
	readonly actionMode?: RecordActionMode;
	readonly emptyText?: string;
	readonly title?: string;
	readonly fallbackText?: string;
	readonly diagnosticsEnabled?: () => boolean;
	readonly onCommand: (message: WebviewToHost) => void | Promise<void>;
}

export class RecordsWebviewProvider implements vscode.WebviewViewProvider {
	private readonly routers = new Set<MessageRouter<WebviewToHost, HostToWebview>>();

	constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly services: RecordsServices,
	) {}

	async resolveWebviewView(view: vscode.WebviewView): Promise<void> {
		view.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.extensionUri],
		};
		view.webview.html = renderWebviewHtml({
			title: this.services.title ?? 'Decision Records',
			bodyTagId: 'cs-records-app',
			scriptUri: view.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webviews', 'records.js')),
			codiconUri: view.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'codicon.css')),
			cspSource: view.webview.cspSource,
			initialState: await this.buildState(),
			fallbackText: this.services.fallbackText ?? 'Loading Decision Records...',
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

	selectFilterForDiagnostics(filter: 'domain', value: string | undefined): void {
		for (const router of this.routers) {
			router.post({
				kind: 'diagnosticSelectFilter',
				filter,
				...(value === undefined ? {} : { value }),
			});
		}
	}

	clickRecordForDiagnostics(id: string, target: 'title' | 'preview'): void {
		for (const router of this.routers) {
			router.post({ kind: 'diagnosticClickRecord', id, target });
		}
	}

	private async buildState(): Promise<HostToWebview> {
		const [records, filterOptions] = await Promise.all([
			this.services.listRecords(),
			this.services.listFilterOptions?.(),
		]);
		const domainFilter = this.services.getDomainFilter?.();
		const diagnosticsEnabled = this.services.diagnosticsEnabled?.() === true;
		return {
			kind: 'state',
			records,
			...(domainFilter === undefined ? {} : { domainFilter }),
			...(filterOptions === undefined ? {} : {
				domainOptions: filterOptions.domains,
			}),
			...(this.services.actionMode === undefined ? {} : { actionMode: this.services.actionMode }),
			...(this.services.emptyText === undefined ? {} : { emptyText: this.services.emptyText }),
			...(diagnosticsEnabled ? { diagnosticsEnabled } : {}),
		};
	}
}
