import * as vscode from 'vscode';
import type { CandidatesWebviewProvider } from '../candidates/candidatesWebviewProvider';
import type { HostToWebview as CandidateHostToWebview, WebviewToHost as CandidateWebviewToHost } from '../candidates/messages';
import type { HostToWebview as RecordHostToWebview, WebviewToHost as RecordWebviewToHost } from '../records/messages';
import type { RecordsWebviewProvider } from '../records/recordsWebviewProvider';
import { renderWebviewHtml } from '../shared/csp';
import { attachMessageRouter, type MessageRouter } from '../shared/messageRouter';
import {
	type HostToWebview,
	type SectionHostToWebview,
	type SectionWebviewToHost,
	type SidebarSection,
	type WebviewToHost,
	isSidebarSection,
	isWebviewToHost,
	sidebarSections,
} from './messages';

const sidebarStateKey = 'sundial.sidebar.state';
const legacyActiveSectionStateKey = 'sundial.sidebar.activeSection';

interface PersistedSidebarState {
	readonly activeSection: SidebarSection;
	readonly visibleSections: readonly SidebarSection[];
}

export interface MainSidebarProviders {
	readonly records: RecordsWebviewProvider;
	readonly research: RecordsWebviewProvider;
	readonly specs: RecordsWebviewProvider;
	readonly candidates: CandidatesWebviewProvider;
	readonly rejected: RecordsWebviewProvider;
	readonly retired: RecordsWebviewProvider;
}

export class MainSidebarWebviewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
	private readonly routers = new Set<MessageRouter<WebviewToHost, HostToWebview>>();
	private readonly subscriptions: vscode.Disposable[] = [];
	private view?: vscode.WebviewView;
	private activeSection: SidebarSection;
	private visibleSections: readonly SidebarSection[];

	constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly state: vscode.Memento,
		private readonly providers: MainSidebarProviders,
	) {
		const persistedState = state.get<unknown>(sidebarStateKey);
		const legacyActiveSection = state.get<unknown>(legacyActiveSectionStateKey);
		const defaults = sidebarSections;
		if (isPersistedSidebarState(persistedState)) {
			this.visibleSections = persistedState.visibleSections;
			this.activeSection = persistedState.activeSection;
		} else {
			this.visibleSections = defaults;
			this.activeSection = isSidebarSection(legacyActiveSection) ? legacyActiveSection : 'records';
		}

		for (const section of ['records', 'research', 'specs', 'rejected', 'retired'] as const) {
			this.subscriptions.push(providers[section].onDidPostMessage(message => this.postSectionMessage(section, message)));
		}
		this.subscriptions.push(providers.candidates.onDidPostMessage(message => this.postSectionMessage('candidates', message)));
	}

	async resolveWebviewView(view: vscode.WebviewView): Promise<void> {
		this.view = view;
		view.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.extensionUri],
		};
		view.webview.html = renderWebviewHtml({
			title: 'Sundial',
			bodyTagId: 'cs-main-sidebar-app',
			scriptUri: view.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webviews', 'main.js')),
			codiconUri: view.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'codicon.css')),
			cspSource: view.webview.cspSource,
			initialState: await this.buildState(),
			fallbackText: 'Loading Sundial...',
		});

		const router = attachMessageRouter<WebviewToHost, HostToWebview>(
			view.webview,
			isWebviewToHost,
			message => this.handleMessage(message),
		);
		this.routers.add(router);
		view.onDidDispose(() => {
			router.dispose();
			this.routers.delete(router);
			if (this.view === view) {
				this.view = undefined;
			}
		});
		await vscode.commands.executeCommand('setContext', 'sundial.activeSidebarSection', this.activeSection);
	}

	async showSection(section: SidebarSection): Promise<void> {
		await this.selectSection(section);
		this.view?.show(false);
	}

	dispose(): void {
		for (const subscription of this.subscriptions) {
			subscription.dispose();
		}
		for (const router of this.routers) {
			router.dispose();
		}
		this.routers.clear();
	}

	private async handleMessage(message: WebviewToHost): Promise<void> {
		switch (message.kind) {
			case 'selectSection':
				await this.selectSection(message.section);
				return;
			case 'setSectionVisibility':
				await this.setSectionVisibility(message.section, message.visible);
				return;
			case 'sectionMessage':
				await this.handleSectionMessage(message.section, message.message);
				return;
		}
	}

	private async selectSection(section: SidebarSection): Promise<void> {
		if (section !== this.activeSection) {
			this.activeSection = section;
			await this.persistState();
			await vscode.commands.executeCommand('setContext', 'sundial.activeSidebarSection', section);
		}
		this.post(await this.buildState());
	}

	private async setSectionVisibility(section: SidebarSection, visible: boolean): Promise<void> {
		const isVisible = this.visibleSections.includes(section);
		if (visible === isVisible || (!visible && this.visibleSections.length === 1)) {
			return;
		}

		this.visibleSections = visible
			? sidebarSections.filter(candidate => candidate === section || this.visibleSections.includes(candidate))
			: this.visibleSections.filter(candidate => candidate !== section);
		if (!this.visibleSections.includes(this.activeSection)) {
			this.activeSection = this.visibleSections[0];
			await vscode.commands.executeCommand('setContext', 'sundial.activeSidebarSection', this.activeSection);
		}
		await this.persistState();
		this.post(await this.buildState());
	}

	private persistState(): Thenable<void> {
		return this.state.update(sidebarStateKey, {
			activeSection: this.activeSection,
			visibleSections: this.visibleSections,
		} satisfies PersistedSidebarState);
	}

	private handleSectionMessage(section: SidebarSection, message: SectionWebviewToHost): void | Promise<void> {
		if (section === 'candidates') {
			return this.providers.candidates.handleMessage(message as CandidateWebviewToHost);
		}
		return this.providers[section].handleMessage(message as RecordWebviewToHost);
	}

	private async buildState(): Promise<HostToWebview> {
		return {
			kind: 'state',
			activeSection: this.activeSection,
			visibleSections: this.visibleSections,
			sectionState: await this.getSectionState(this.activeSection),
		};
	}

	private getSectionState(section: SidebarSection): Promise<SectionHostToWebview> {
		if (section === 'candidates') {
			return this.providers.candidates.getState() as Promise<CandidateHostToWebview>;
		}
		return this.providers[section].getState() as Promise<RecordHostToWebview>;
	}

	private postSectionMessage(section: SidebarSection, message: SectionHostToWebview): void {
		this.post({ kind: 'sectionMessage', section, message });
	}

	private post(message: HostToWebview): void {
		for (const router of this.routers) {
			router.post(message);
		}
	}
}

function isPersistedSidebarState(value: unknown): value is PersistedSidebarState {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const state = value as Record<string, unknown>;
	return isSidebarSection(state.activeSection)
		&& Array.isArray(state.visibleSections)
		&& state.visibleSections.length > 0
		&& state.visibleSections.every(isSidebarSection)
		&& new Set(state.visibleSections).size === state.visibleSections.length
		&& state.visibleSections.includes(state.activeSection);
}
