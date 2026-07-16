import * as vscode from 'vscode';
import { createIntegrationStub } from '../../integrationStub.js';
import type { PromptContext } from '../../promptCommand.js';
import { assertNever } from '../shared/assertNever.js';
import { renderWebviewHtml } from '../shared/csp.js';
import { attachMessageRouter, type MessageRouter } from '../shared/messageRouter.js';
import { type HostToWebview, type WebviewToHost, isWebviewToHost } from './messages.js';

export interface MessagesServices {
	readonly returnToSource: (prompt: PromptContext) => void | Promise<void>;
}

export interface MessagesDiagnostics {
	readonly viewResolved: boolean;
	readonly viewVisible: boolean;
	readonly state: HostToWebview;
}

interface PendingPrompt {
	readonly prompt: PromptContext;
	readonly draft: string;
}

export class MessagesWebviewProvider implements vscode.WebviewViewProvider {
	private readonly routers = new Set<MessageRouter<WebviewToHost, HostToWebview>>();
	private view: vscode.WebviewView | undefined;
	private pendingPrompt: PendingPrompt | undefined;

	constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly services: MessagesServices,
	) {}

	async resolveWebviewView(view: vscode.WebviewView): Promise<void> {
		this.view = view;
		view.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.extensionUri],
		};
		view.webview.html = renderWebviewHtml({
			title: 'Sundial Editor Messages',
			bodyTagId: 'se-messages-app',
			scriptUri: view.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webviews', 'messages.js')),
			codiconUri: view.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'codicon.css')),
			cspSource: view.webview.cspSource,
			initialState: this.stateMessage(),
			fallbackText: 'Loading Messages...',
		});

		const router = attachMessageRouter<WebviewToHost, HostToWebview>(
			view.webview,
			isWebviewToHost,
			message => this.handleMessage(message),
		);
		this.routers.add(router);
		view.onDidChangeVisibility(() => this.focusPendingComposer());
		view.onDidDispose(() => {
			router.dispose();
			this.routers.delete(router);
			if (this.view === view) {
				this.view = undefined;
			}
		});

		if (view.visible) {
			queueMicrotask(() => this.focusPendingComposer());
		}
	}

	async openPrompt(prompt: PromptContext): Promise<void> {
		this.post({ kind: 'clearPrompt' });
		this.pendingPrompt = {
			prompt,
			draft: createIntegrationStub(prompt),
		};
		await vscode.commands.executeCommand('workbench.view.extension.sundialEditor');
		await vscode.commands.executeCommand('sundialEditor.messages.focus');
		this.focusPendingComposer();
	}

	diagnostics(): MessagesDiagnostics {
		return {
			viewResolved: this.view !== undefined,
			viewVisible: this.view?.visible === true,
			state: this.stateMessage(),
		};
	}

	async acknowledgePendingSubmission(): Promise<void> {
		const prompt = this.pendingPrompt?.prompt;
		this.pendingPrompt = undefined;
		this.post({ kind: 'submissionAcknowledged' });
		if (prompt !== undefined) {
			await this.services.returnToSource(prompt);
		}
	}

	private handleMessage(message: WebviewToHost): void {
		switch (message.kind) {
			case 'submit':
				void this.acknowledgePendingSubmission();
				return;
			case 'cancel': {
				const prompt = this.pendingPrompt?.prompt;
				this.pendingPrompt = undefined;
				this.post({ kind: 'clearPrompt' });
				if (prompt !== undefined) {
					void this.services.returnToSource(prompt);
				}
				return;
			}
			default:
				return assertNever(message);
		}
	}

	private focusPendingComposer(): void {
		if (this.view?.visible !== true || this.pendingPrompt === undefined) {
			return;
		}

		this.post(this.stateMessage());
		this.post({ kind: 'focusComposer' });
	}

	private stateMessage(): HostToWebview {
		return this.pendingPrompt === undefined
			? { kind: 'state' }
			: {
				kind: 'state',
				prompt: this.pendingPrompt.prompt,
				draft: this.pendingPrompt.draft,
			};
	}

	private post(message: HostToWebview): void {
		for (const router of this.routers) {
			router.post(message);
		}
	}
}
