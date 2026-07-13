import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';
import * as vscode from 'vscode';
import {
	discoverSundialRoot,
	listCandidateSummaries,
	listDecisionRecordSummaries,
	listKnownDomains,
	listResearchSummaries,
	listSidebarSpecGroups,
	listSidebarSpecSummaries,
	listSpecLanes,
	listSpecSummaries,
	defaultSpecLanes,
	type DecisionRecordSummary,
	type DecisionRecordSummaryStatus,
	type ResearchSummary,
} from './candidateInbox';
import { WelcomeWebviewProvider } from './webviews/welcome/welcomeWebviewProvider';
import { RecordsWebviewProvider } from './webviews/records/recordsWebviewProvider';
import { CandidatesWebviewProvider } from './webviews/candidates/candidatesWebviewProvider';
import { SpecsBoardPanel, type SpecsBoardState } from './webviews/specs/specsBoardPanel';
import type { RecordClickTarget, RecordRenderDiagnostic, RecordSummary, SpecRecordGroup } from './webviews/records/messages';
import type { BootstrapProvider, CandidateRenderDiagnostic, CandidateSummary } from './webviews/candidates/messages';
import type { SpecCard, SpecsRenderDiagnostic } from './webviews/specs/messages';
import type { WebviewToHost as WelcomeWebviewToHost, WelcomeRenderDiagnostic } from './webviews/welcome/messages';
import { renderMarkdownPreviewSource } from './markdownPreview';
import { sundialCliCommand, sundialCliInstallArgs } from './sundialCli';
import { MarkdownCommentBubbleDecorations } from './commentBubbles';
import {
	buildClaudeSpecSessionUri,
	buildCodexSpecSessionArguments,
	buildProviderSpecSessionPrompt,
	type SpecSessionLaunchResult,
	type SpecSessionPhase,
	type SpecSessionProvider,
	type SpecSessionSpec,
} from './specSessions';

const execFileAsync = promisify(execFile);
const markdownPreviewScheme = 'sundial-preview';
const specsCollapsedGroupsStateKey = 'sundial.specs.sidebar.collapsedGroups';
let activeMarkdownPreviewProvider: FrontmatterMarkdownPreviewProvider | undefined;

interface RecordsState {
	domainFilter: string | undefined;
}

interface WorkspaceStore {
	readonly root: string;
	readonly name: string;
}

interface RecordsDiagnostics {
	lastState?: {
		readonly recordCount: number;
		readonly domainFilter?: string;
	};
	lastRendered?: RecordRenderDiagnostic;
	current?: {
		readonly workspaceFolders: readonly string[];
		readonly storeRoots: readonly string[];
		readonly recordCount: number;
	};
}

interface CandidatesDiagnostics {
	lastState?: {
		readonly candidateCount: number;
	};
	lastRendered?: CandidateRenderDiagnostic;
}

interface SpecsBoardDiagnostics {
	lastState?: {
		readonly laneCount: number;
		readonly specCount: number;
	};
	lastRendered?: SpecsRenderDiagnostic;
}

interface WelcomeDiagnostics {
	lastRendered?: WelcomeRenderDiagnostic;
	lastCommand?: WelcomeWebviewToHost;
}

export function activate(context: vscode.ExtensionContext): void {
	const recordsState: RecordsState = { domainFilter: undefined };
	const researchState: RecordsState = { domainFilter: undefined };
	const recordsDiagnostics: RecordsDiagnostics = {};
	const researchDiagnostics: RecordsDiagnostics = {};
	const specsDiagnostics: RecordsDiagnostics = {};
	const specsBoardDiagnostics: SpecsBoardDiagnostics = {};
	const rejectedRecordsDiagnostics: RecordsDiagnostics = {};
	const retiredRecordsDiagnostics: RecordsDiagnostics = {};
	const candidatesDiagnostics: CandidatesDiagnostics = {};
	const welcomeDiagnostics: WelcomeDiagnostics = {};
	const diagnosticsEnabled = isIntegrationTest();
	const diagnosticsChannel = vscode.window.createOutputChannel('Sundial Diagnostics');
	context.subscriptions.push(diagnosticsChannel);
	let researchProvider: RecordsWebviewProvider;
	let specsProvider: RecordsWebviewProvider;
	let specsBoardPanel: SpecsBoardPanel;
	const markdownPreviewProvider = new FrontmatterMarkdownPreviewProvider();
	activeMarkdownPreviewProvider = markdownPreviewProvider;
	context.subscriptions.push(markdownPreviewProvider);
	context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(markdownPreviewScheme, markdownPreviewProvider));
	context.subscriptions.push(new MarkdownCommentBubbleDecorations());
	context.subscriptions.push({
		dispose: () => {
			if (activeMarkdownPreviewProvider === markdownPreviewProvider) {
				activeMarkdownPreviewProvider = undefined;
			}
		},
	});

	const welcomeProvider = new WelcomeWebviewProvider(context.extensionUri, {
		getState: async () => ({ cliAvailable: await isCliAvailable(), cliPath: cliPath() }),
		diagnosticsEnabled: () => diagnosticsEnabled,
		onCommand: command => {
			if (command.kind === 'rendered') {
				if (diagnosticsEnabled) {
					welcomeDiagnostics.lastRendered = command.diagnostic;
				}
				return;
			}

			if (diagnosticsEnabled) {
				welcomeDiagnostics.lastCommand = command;
			}

			if (command.kind === 'installCli') {
				void vscode.commands.executeCommand('sundial.installCli');
				return;
			}

			if (command.kind === 'init') {
				void initializeProject(
					welcomeProvider,
					candidatesProvider,
					recordsProvider,
					researchProvider,
					specsProvider,
					specsBoardPanel,
					rejectedRecordsProvider,
					retiredRecordsProvider,
					{ claude: command.claude, codex: command.codex },
				);
			}
		},
	});

	let candidatesProvider: CandidatesWebviewProvider;
	let rejectedRecordsProvider: RecordsWebviewProvider;
	let retiredRecordsProvider: RecordsWebviewProvider;
	let governanceRefreshTimer: NodeJS.Timeout | undefined;
	const refreshGovernance = async (): Promise<void> => {
		await refreshGovernanceViews(welcomeProvider, candidatesProvider, recordsProvider, rejectedRecordsProvider, retiredRecordsProvider, researchProvider, specsProvider);
		await specsBoardPanel.refresh();
	};
	const scheduleGovernanceRefresh = (): void => {
		if (governanceRefreshTimer !== undefined) {
			clearTimeout(governanceRefreshTimer);
		}

		governanceRefreshTimer = setTimeout(() => {
			governanceRefreshTimer = undefined;
			void refreshGovernance();
		}, 50);
	};

	const recordsProvider = new RecordsWebviewProvider(context.extensionUri, {
		listRecords: async () => {
			const records = await collectRecords(recordsState);
			recordsDiagnostics.lastState = {
				recordCount: records.length,
				...(recordsState.domainFilter === undefined ? {} : { domainFilter: recordsState.domainFilter }),
			};
			return records;
		},
		listFilterOptions: () => collectRecordFilterOptions(),
		getDomainFilter: () => recordsState.domainFilter,
		actionMode: 'accepted',
		diagnosticsEnabled: () => diagnosticsEnabled,
		onCommand: async message => {
			if (message.kind === 'rendered') {
				if (diagnosticsEnabled) {
					recordsDiagnostics.lastRendered = message.diagnostic;
				}
				return;
			}

			if (message.kind === 'preview') {
				await previewRecord(message.id);
				return;
			}

			if (message.kind === 'edit') {
				await editRecordSource(message.id);
				return;
			}

			if (message.kind === 'toggleEnabled') {
				await setRecordEnabled(message.id, message.enabled, refreshGovernance);
				return;
			}

			if (message.kind === 'retire') {
				await retireRecord(message.id, refreshGovernance, message.retiredBy);
				return;
			}

			if (message.kind === 'setDomainFilter') {
				recordsState.domainFilter = normalizeFilterValue(message.domainFilter);
				await recordsProvider.refresh();
				return;
			}

			if (message.kind === 'clearFilters') {
				clearRecordFilters(recordsState);
				await recordsProvider.refresh();
				return;
			}

			if (message.kind === 'requestRefresh') {
				await recordsProvider.refresh();
			}
		},
	});

	researchProvider = new RecordsWebviewProvider(context.extensionUri, {
		listRecords: async () => {
			const records = await collectResearch(researchState);
			researchDiagnostics.lastState = {
				recordCount: records.length,
				...(researchState.domainFilter === undefined ? {} : { domainFilter: researchState.domainFilter }),
			};
			return records;
		},
		listFilterOptions: () => collectResearchFilterOptions(),
		getDomainFilter: () => researchState.domainFilter,
		actionMode: 'research',
		emptyText: 'No research notes yet.',
		title: 'Research',
		fallbackText: 'Loading Research...',
		diagnosticsEnabled: () => diagnosticsEnabled,
		onCommand: async message => {
			if (message.kind === 'rendered') {
				if (diagnosticsEnabled) {
					researchDiagnostics.lastRendered = message.diagnostic;
				}
				return;
			}

			if (message.kind === 'preview') {
				await previewResearch(message.id);
				return;
			}

			if (message.kind === 'edit') {
				await editResearchSource(message.id);
				return;
			}

			if (message.kind === 'setDomainFilter') {
				researchState.domainFilter = normalizeFilterValue(message.domainFilter);
				await researchProvider.refresh();
				return;
			}

			if (message.kind === 'clearFilters') {
				clearRecordFilters(researchState);
				await researchProvider.refresh();
				return;
			}

			if (message.kind === 'requestRefresh') {
				await researchProvider.refresh();
			}
		},
	});

	specsProvider = new RecordsWebviewProvider(context.extensionUri, {
		listRecords: async () => {
			const records = await collectSpecs();
			specsDiagnostics.lastState = { recordCount: records.length };
			return records;
		},
		listSpecGroups: () => collectSpecGroups(context),
		listSpecStatusOptions: collectSpecStatusOptions,
		listWorkspaces: collectSpecWorkspaceOptions,
		actionMode: 'specs',
		emptyText: 'No specs yet.',
		title: 'Specs',
		fallbackText: 'Loading Specs...',
		diagnosticsEnabled: () => diagnosticsEnabled,
		onCommand: async message => {
			if (message.kind === 'rendered') {
				if (diagnosticsEnabled) {
					specsDiagnostics.lastRendered = message.diagnostic;
				}
				return;
			}

			if (message.kind === 'preview') {
				await openSpec(message.id);
				return;
			}

			if (message.kind === 'edit') {
				await openSpec(message.id);
				return;
			}

			if (message.kind === 'requestRefresh') {
				await specsProvider.refresh();
				return;
			}

			if (message.kind === 'openBoard') {
				specsBoardPanel.reveal();
				return;
			}

			if (message.kind === 'toggleSpecGroup') {
				await setSpecGroupCollapsed(context, message.status, message.collapsed);
				await specsProvider.refresh();
				return;
			}

			if (message.kind === 'createSpec') {
				await createSpec(message.title, message.status, message.workspace, specsProvider, specsBoardPanel);
				return;
			}

			if (message.kind === 'moveSpec') {
				await moveSpec(message.id, message.status, message.workspace, specsProvider, specsBoardPanel);
				return;
			}

			if (message.kind === 'deleteSpec') {
				await deleteSpec(message.id, message.workspace, specsProvider, specsBoardPanel, message.skipConfirmation === true);
				return;
			}

			if (message.kind === 'launchSpec') {
				await launchSpecSession(message.phase, message.id, message.workspace);
			}
		},
	});

	specsBoardPanel = new SpecsBoardPanel(context.extensionUri, {
		getState: async () => {
			const state = await collectSpecBoardState();
			specsBoardDiagnostics.lastState = {
				laneCount: state.lanes.length,
				specCount: state.specs.length,
			};
			return state;
		},
		diagnosticsEnabled: () => diagnosticsEnabled,
		onCommand: async message => {
			if (message.kind === 'rendered') {
				if (diagnosticsEnabled) {
					specsBoardDiagnostics.lastRendered = message.diagnostic;
				}
				return;
			}

			if (message.kind === 'requestRefresh') {
				await specsBoardPanel.refresh();
				return;
			}

			if (message.kind === 'open') {
				await openSpec(message.id, message.workspace);
				return;
			}

			if (message.kind === 'create') {
				await createSpec(message.title, message.status, message.workspace, specsProvider, specsBoardPanel);
				return;
			}

			if (message.kind === 'move') {
				await moveSpec(message.id, message.status, message.workspace, specsProvider, specsBoardPanel);
				return;
			}

			if (message.kind === 'delete') {
				await deleteSpec(message.id, message.workspace, specsProvider, specsBoardPanel);
				return;
			}

			if (message.kind === 'launch') {
				await launchSpecSession(message.phase, message.id, message.workspace);
			}
		},
	});

	rejectedRecordsProvider = createLifecycleRecordsProvider(
		context.extensionUri,
		'rejected',
		'No rejected decision records.',
		rejectedRecordsDiagnostics,
		() => diagnosticsEnabled,
		refreshGovernance,
	);
	retiredRecordsProvider = createLifecycleRecordsProvider(
		context.extensionUri,
		'retired',
		'No retired decision records.',
		retiredRecordsDiagnostics,
		() => diagnosticsEnabled,
		refreshGovernance,
	);

	candidatesProvider = new CandidatesWebviewProvider(context.extensionUri, {
		listCandidates: async () => {
			const candidates = await collectCandidates();
			candidatesDiagnostics.lastState = { candidateCount: candidates.length };
			return candidates;
		},
		listInstalledProviders: () => collectInstalledProviders(),
		hasAcceptedRecords: async () => (await collectRecords(undefined, 'accepted')).length > 0,
		diagnosticsEnabled: () => diagnosticsEnabled,
		onCommand: async message => {
			if (message.kind === 'rendered') {
				if (diagnosticsEnabled) {
					candidatesDiagnostics.lastRendered = message.diagnostic;
				}
				return;
			}

			if (message.kind === 'requestRefresh') {
				await candidatesProvider.refresh();
				await refreshWorkspaceState(welcomeProvider);
				return;
			}

			if (message.kind === 'bootstrap') {
				await bootstrap(candidatesProvider, undefined, message.provider);
				return;
			}

			if (message.kind === 'preview' || message.kind === 'open') {
				await previewCandidate(message.id, message.filePath);
				return;
			}

			if (message.kind === 'edit') {
				await editCandidateSource(message.id, message.filePath);
				return;
			}

			if (message.kind === 'reject') {
				await rejectCandidate(message.id, message.filePath, welcomeProvider, candidatesProvider, recordsProvider, rejectedRecordsProvider, retiredRecordsProvider, message.reason);
				return;
			}

			if (message.kind === 'accept') {
				await acceptCandidate(message.id, message.filePath, welcomeProvider, candidatesProvider, recordsProvider, rejectedRecordsProvider, retiredRecordsProvider);
				return;
			}

			if (message.kind === 'dismiss') {
				await dismissCandidate(message.id, message.filePath, welcomeProvider, candidatesProvider, recordsProvider, rejectedRecordsProvider, retiredRecordsProvider);
				return;
			}

			if (message.kind === 'retire') {
				await retireCandidate(message.id, message.filePath, welcomeProvider, candidatesProvider, recordsProvider, rejectedRecordsProvider, retiredRecordsProvider, message.retiredBy);
			}
		},
	});

	context.subscriptions.push(vscode.window.registerWebviewViewProvider('sundial.welcome', welcomeProvider));
	context.subscriptions.push(vscode.window.registerWebviewViewProvider('sundial.records', recordsProvider));
	context.subscriptions.push(vscode.window.registerWebviewViewProvider('sundial.research', researchProvider));
	context.subscriptions.push(vscode.window.registerWebviewViewProvider('sundial.specs', specsProvider));
	context.subscriptions.push(vscode.window.registerWebviewViewProvider('sundial.records.rejected', rejectedRecordsProvider));
	context.subscriptions.push(vscode.window.registerWebviewViewProvider('sundial.records.retired', retiredRecordsProvider));
	context.subscriptions.push(vscode.window.registerWebviewViewProvider('sundial.candidates', candidatesProvider));
	context.subscriptions.push(specsBoardPanel);
	const governanceWatcher = vscode.workspace.createFileSystemWatcher('**/sundial/{decisions,research,specs}/**/*.{md,yml,yaml}');
	context.subscriptions.push(
		governanceWatcher,
		governanceWatcher.onDidCreate(scheduleGovernanceRefresh),
		governanceWatcher.onDidChange(scheduleGovernanceRefresh),
		governanceWatcher.onDidDelete(scheduleGovernanceRefresh),
		{
			dispose: () => {
				if (governanceRefreshTimer !== undefined) {
					clearTimeout(governanceRefreshTimer);
				}
			},
		},
	);

	context.subscriptions.push(vscode.commands.registerCommand('sundial.installCli', () => installCli(welcomeProvider)));
	context.subscriptions.push(vscode.commands.registerCommand('sundial.bootstrap', () => bootstrap(candidatesProvider)));
	context.subscriptions.push(vscode.commands.registerCommand('sundial.records.filterByDomain', () => runFilterByDomain(recordsState, recordsProvider)));
	context.subscriptions.push(vscode.commands.registerCommand('sundial.research.filterByDomain', () => runFilterByDomain(researchState, researchProvider)));
	context.subscriptions.push(vscode.commands.registerCommand('sundial.records.clearFilters', async () => {
		clearRecordFilters(recordsState);
		await recordsProvider.refresh();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('sundial.research.clearFilters', async () => {
		clearRecordFilters(researchState);
		await researchProvider.refresh();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('sundial.records.openPreview', (id?: string) => previewRecord(id)));
	context.subscriptions.push(vscode.commands.registerCommand('sundial.records.editSource', (id?: string) => editRecordSource(id)));
	context.subscriptions.push(vscode.commands.registerCommand('sundial.research.openPreview', (id?: string) => previewResearch(id)));
	context.subscriptions.push(vscode.commands.registerCommand('sundial.research.editSource', (id?: string) => editResearchSource(id)));
	context.subscriptions.push(vscode.commands.registerCommand('sundial.specs.openBoard', () => specsBoardPanel.reveal()));
	context.subscriptions.push(vscode.commands.registerCommand('sundial.specs.openSpec', (id?: string) => openSpec(id)));
	context.subscriptions.push(vscode.commands.registerCommand('sundial.specs.plan', (id?: string) => launchSpecSession('planning', id)));
	context.subscriptions.push(vscode.commands.registerCommand('sundial.specs.implement', (id?: string) => launchSpecSession('implementation', id)));
	context.subscriptions.push(vscode.commands.registerCommand('sundial.specs.review', (id?: string) => launchSpecSession('review', id)));
	context.subscriptions.push(vscode.commands.registerCommand('sundial.candidates.open', (id?: string) => previewCandidate(id)));
	context.subscriptions.push(vscode.commands.registerCommand('sundial.candidates.editSource', (id?: string) => editCandidateSource(id)));
	context.subscriptions.push(vscode.commands.registerCommand('sundial.candidates.accept', (id?: string) => {
		return acceptCandidate(id, undefined, welcomeProvider, candidatesProvider, recordsProvider, rejectedRecordsProvider, retiredRecordsProvider);
	}));
	context.subscriptions.push(vscode.commands.registerCommand('sundial.candidates.reject', (id?: string) => {
		return rejectCandidate(id, undefined, welcomeProvider, candidatesProvider, recordsProvider, rejectedRecordsProvider, retiredRecordsProvider);
	}));
	context.subscriptions.push(vscode.commands.registerCommand('sundial.candidates.retire', (id?: string) => {
		return retireCandidate(id, undefined, welcomeProvider, candidatesProvider, recordsProvider, rejectedRecordsProvider, retiredRecordsProvider);
	}));
	context.subscriptions.push(vscode.commands.registerCommand('sundial.candidates.dismiss', (id?: string) => {
		return dismissCandidate(id, undefined, welcomeProvider, candidatesProvider, recordsProvider, rejectedRecordsProvider, retiredRecordsProvider);
	}));
	context.subscriptions.push(vscode.commands.registerCommand('sundial.showDiagnostics', async () => {
		const diagnostics = await buildDiagnostics(
			context.extensionUri,
			context.extensionMode,
			recordsDiagnostics,
			rejectedRecordsDiagnostics,
			retiredRecordsDiagnostics,
			researchDiagnostics,
			specsDiagnostics,
			specsBoardDiagnostics,
			candidatesDiagnostics,
			welcomeDiagnostics,
			recordsState,
			researchState,
		);
		diagnosticsChannel.clear();
		diagnosticsChannel.appendLine(formatDiagnostics(diagnostics));
		diagnosticsChannel.show(true);
	}));
	if (diagnosticsEnabled) {
		context.subscriptions.push(vscode.commands.registerCommand(
			'sundial.internal.webviewDiagnostics',
			() => buildDiagnostics(
				context.extensionUri,
				context.extensionMode,
				recordsDiagnostics,
				rejectedRecordsDiagnostics,
				retiredRecordsDiagnostics,
				researchDiagnostics,
				specsDiagnostics,
				specsBoardDiagnostics,
				candidatesDiagnostics,
				welcomeDiagnostics,
				recordsState,
				researchState,
			),
		));
		context.subscriptions.push(vscode.commands.registerCommand(
			'sundial.internal.welcome.toggleAgent',
			(agent: 'claude' | 'codex', selected: boolean) => welcomeProvider.toggleAgentForDiagnostics(agent, selected),
		));
		context.subscriptions.push(vscode.commands.registerCommand(
			'sundial.internal.welcome.click',
			() => welcomeProvider.clickInitForDiagnostics(),
		));
		context.subscriptions.push(vscode.commands.registerCommand(
			'sundial.internal.candidates.click',
			(id: string, target: 'title' | 'preview') => candidatesProvider.clickCandidateForDiagnostics(id, target),
		));
		context.subscriptions.push(vscode.commands.registerCommand(
			'sundial.internal.candidates.selectProvider',
			(provider: BootstrapProvider) => candidatesProvider.selectProviderForDiagnostics(provider),
		));
		context.subscriptions.push(vscode.commands.registerCommand(
			'sundial.internal.candidates.refresh',
			() => candidatesProvider.refresh(),
		));
		context.subscriptions.push(vscode.commands.registerCommand(
			'sundial.internal.candidates.lifecycle',
			(action: 'accept' | 'reject' | 'dismiss', id: string, reason?: string) => {
				if (action === 'accept') {
					return acceptCandidate(id, undefined, welcomeProvider, candidatesProvider, recordsProvider, rejectedRecordsProvider, retiredRecordsProvider);
				}

				if (action === 'dismiss') {
					return dismissCandidate(id, undefined, welcomeProvider, candidatesProvider, recordsProvider, rejectedRecordsProvider, retiredRecordsProvider, true);
				}

				return rejectCandidate(id, undefined, welcomeProvider, candidatesProvider, recordsProvider, rejectedRecordsProvider, retiredRecordsProvider, reason ?? '');
			},
		));
		context.subscriptions.push(vscode.commands.registerCommand(
			'sundial.internal.records.lifecycle',
			(action: 'enable' | 'disable' | 'retire' | 'promote' | 'delete', id: string, value?: string) => {
				if (action === 'enable' || action === 'disable') {
					return setRecordEnabled(id, action === 'enable', refreshGovernance);
				}

				if (action === 'retire') {
					return retireRecord(id, refreshGovernance, value);
				}

				if (action === 'delete') {
					return deleteRecord(id, value === 'rejected' ? 'rejected' : 'retired', refreshGovernance, true);
				}

				return promoteRecord(id, value === 'rejected' ? 'rejected' : 'retired', refreshGovernance);
			},
		));
		context.subscriptions.push(vscode.commands.registerCommand(
			'sundial.internal.records.selectFilter',
			(filter: 'domain', value?: string) => recordsProvider.selectFilterForDiagnostics(filter, value),
		));
		context.subscriptions.push(vscode.commands.registerCommand(
			'sundial.internal.specs.click',
			(id: string, target: RecordClickTarget, workspace?: string) => specsProvider.clickRecordForDiagnostics(id, target, workspace),
		));
		context.subscriptions.push(vscode.commands.registerCommand(
			'sundial.internal.specs.create',
			(title: string, status?: string, workspace?: string) => specsProvider.createSpecForDiagnostics(title, status, workspace),
		));
		context.subscriptions.push(vscode.commands.registerCommand(
			'sundial.internal.specs.move',
			(id: string, status: string, workspace?: string) => specsProvider.moveSpecForDiagnostics(id, status, workspace),
		));
		context.subscriptions.push(vscode.commands.registerCommand(
			'sundial.internal.specs.delete',
			(id: string, workspace?: string) => specsProvider.deleteSpecForDiagnostics(id, workspace, true),
		));
	}
	context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
		void candidatesProvider.refresh();
		void recordsProvider.refresh();
		void researchProvider.refresh();
		void specsProvider.refresh();
		void rejectedRecordsProvider.refresh();
		void retiredRecordsProvider.refresh();
		void refreshWorkspaceState(welcomeProvider);
	}));
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
		if (event.affectsConfiguration('sundial.cliPath')) {
			void refreshWorkspaceState(welcomeProvider);
		}
	}));

	void refreshWorkspaceState(welcomeProvider);
}

export function deactivate(): void {}

class FrontmatterMarkdownPreviewProvider implements vscode.TextDocumentContentProvider {
	private readonly documents = new Map<string, string>();
	private readonly changed = new vscode.EventEmitter<vscode.Uri>();
	readonly onDidChange = this.changed.event;

	provideTextDocumentContent(uri: vscode.Uri): string {
		return this.documents.get(uri.toString()) ?? '';
	}

	async previewUriForFile(filePath: string): Promise<vscode.Uri> {
		const uri = vscode.Uri.from({ scheme: markdownPreviewScheme, path: filePath });
		const markdown = await fs.readFile(filePath, 'utf8');
		this.documents.set(uri.toString(), renderMarkdownPreviewSource(markdown));
		this.changed.fire(uri);
		return uri;
	}

	dispose(): void {
		this.documents.clear();
		this.changed.dispose();
	}
}

function createLifecycleRecordsProvider(
	extensionUri: vscode.Uri,
	status: Exclude<DecisionRecordSummaryStatus, 'accepted'>,
	emptyText: string,
	diagnostics: RecordsDiagnostics,
	diagnosticsEnabled: () => boolean,
	onLifecycleCompleted: () => Promise<void>,
): RecordsWebviewProvider {
	const provider = new RecordsWebviewProvider(extensionUri, {
		listRecords: async () => {
			const records = await collectRecords(undefined, status);
			diagnostics.lastState = { recordCount: records.length };
			return records;
		},
		actionMode: status,
		emptyText,
		diagnosticsEnabled,
		onCommand: async message => {
			if (message.kind === 'rendered') {
				if (diagnosticsEnabled()) {
					diagnostics.lastRendered = message.diagnostic;
				}
				return;
			}

			if (message.kind === 'preview') {
				await previewRecord(message.id, status);
				return;
			}

			if (message.kind === 'edit') {
				await editRecordSource(message.id, status);
				return;
			}

			if (message.kind === 'promote') {
				await promoteRecord(message.id, status, onLifecycleCompleted);
				return;
			}

			if (message.kind === 'delete') {
				await deleteRecord(message.id, status, onLifecycleCompleted);
				return;
			}

			if (message.kind === 'requestRefresh') {
				await provider.refresh();
			}
		},
	});
	return provider;
}

interface DiagnosticAsset {
	readonly relativePath: string;
	readonly fsPath: string;
	readonly exists: boolean;
}

interface ExtensionDiagnostics {
	readonly extensionUri: string;
	readonly extensionMode: string;
	readonly workspaceFolders: readonly string[];
	readonly storeRoots: readonly string[];
	readonly acceptedRecordCount: number;
	readonly rejectedRecordCount: number;
	readonly retiredRecordCount: number;
	readonly activeCandidateCount: number;
	readonly recordsLastState?: RecordsDiagnostics['lastState'];
	readonly recordsLastRendered?: RecordsDiagnostics['lastRendered'];
	readonly rejectedRecordsLastState?: RecordsDiagnostics['lastState'];
	readonly rejectedRecordsLastRendered?: RecordsDiagnostics['lastRendered'];
	readonly retiredRecordsLastState?: RecordsDiagnostics['lastState'];
	readonly retiredRecordsLastRendered?: RecordsDiagnostics['lastRendered'];
	readonly researchLastState?: RecordsDiagnostics['lastState'];
	readonly researchLastRendered?: RecordsDiagnostics['lastRendered'];
	readonly specsCount: number;
	readonly specsLastState?: RecordsDiagnostics['lastState'];
	readonly specsLastRendered?: RecordsDiagnostics['lastRendered'];
	readonly specsBoardLastState?: SpecsBoardDiagnostics['lastState'];
	readonly specsBoardLastRendered?: SpecsBoardDiagnostics['lastRendered'];
	readonly candidatesLastState?: CandidatesDiagnostics['lastState'];
	readonly candidatesLastRendered?: CandidatesDiagnostics['lastRendered'];
	readonly welcomeLastRendered?: WelcomeDiagnostics['lastRendered'];
	readonly welcomeLastCommand?: WelcomeDiagnostics['lastCommand'];
	readonly assets: readonly DiagnosticAsset[];
}

async function buildDiagnostics(
	extensionUri: vscode.Uri,
	extensionMode: vscode.ExtensionMode,
	recordsDiagnostics: RecordsDiagnostics,
	rejectedRecordsDiagnostics: RecordsDiagnostics,
	retiredRecordsDiagnostics: RecordsDiagnostics,
	researchDiagnostics: RecordsDiagnostics,
	specsDiagnostics: RecordsDiagnostics,
	specsBoardDiagnostics: SpecsBoardDiagnostics,
	candidatesDiagnostics: CandidatesDiagnostics,
	welcomeDiagnostics: WelcomeDiagnostics,
	recordsState: RecordsState,
	researchState: RecordsState,
): Promise<ExtensionDiagnostics> {
	const stores = await collectWorkspaceStores();
	const records = await collectRecords(recordsState);
	const rejectedRecords = await collectRecords(undefined, 'rejected');
	const retiredRecords = await collectRecords(undefined, 'retired');
	const research = await collectResearch(researchState);
	const specs = await collectSpecs();
	const candidates = await collectCandidates();
	return {
		extensionUri: extensionUri.toString(),
		extensionMode: extensionModeName(extensionMode),
		workspaceFolders: (vscode.workspace.workspaceFolders ?? []).map(folder => folder.uri.fsPath),
		storeRoots: stores.map(store => store.root),
		acceptedRecordCount: records.length,
		rejectedRecordCount: rejectedRecords.length,
		retiredRecordCount: retiredRecords.length,
		activeCandidateCount: candidates.length,
		recordsLastState: recordsDiagnostics.lastState,
		recordsLastRendered: recordsDiagnostics.lastRendered,
		rejectedRecordsLastState: rejectedRecordsDiagnostics.lastState,
		rejectedRecordsLastRendered: rejectedRecordsDiagnostics.lastRendered,
		retiredRecordsLastState: retiredRecordsDiagnostics.lastState,
		retiredRecordsLastRendered: retiredRecordsDiagnostics.lastRendered,
		researchLastState: researchDiagnostics.lastState ?? { recordCount: research.length },
		researchLastRendered: researchDiagnostics.lastRendered,
		specsCount: specs.length,
		specsLastState: specsDiagnostics.lastState ?? { recordCount: specs.length },
		specsLastRendered: specsDiagnostics.lastRendered,
		specsBoardLastState: specsBoardDiagnostics.lastState,
		specsBoardLastRendered: specsBoardDiagnostics.lastRendered,
		candidatesLastState: candidatesDiagnostics.lastState,
		candidatesLastRendered: candidatesDiagnostics.lastRendered,
		welcomeLastRendered: welcomeDiagnostics.lastRendered,
		welcomeLastCommand: welcomeDiagnostics.lastCommand,
		assets: await Promise.all([
			'dist/webviews/welcome.js',
			'dist/webviews/records.js',
			'dist/webviews/candidates.js',
			'dist/webviews/specs.js',
			'media/codicon.css',
			'media/codicon.ttf',
		].map(relativePath => assetDiagnostic(extensionUri, relativePath))),
	};
}

function extensionModeName(extensionMode: vscode.ExtensionMode): string {
	return vscode.ExtensionMode[extensionMode] ?? String(extensionMode);
}

async function assetDiagnostic(extensionUri: vscode.Uri, relativePath: string): Promise<DiagnosticAsset> {
	const uri = vscode.Uri.joinPath(extensionUri, ...relativePath.split('/'));
	return {
		relativePath,
		fsPath: uri.fsPath,
		exists: await fileExists(uri.fsPath),
	};
}

function formatDiagnostics(diagnostics: ExtensionDiagnostics): string {
	return JSON.stringify(diagnostics, undefined, 2);
}

async function collectWorkspaceStores(): Promise<readonly WorkspaceStore[]> {
	const folders = vscode.workspace.workspaceFolders ?? [];
	const stores: WorkspaceStore[] = [];
	const seen = new Set<string>();

	for (const folder of folders) {
		const root = await discoverSundialRoot(folder.uri.fsPath);
		if (root === undefined || seen.has(root)) {
			continue;
		}

		seen.add(root);
		stores.push({
			root,
			name: folder.uri.fsPath === root ? folder.name : path.basename(root),
		});
	}

	return stores;
}

async function collectRecords(
	filters: Partial<RecordsState> | undefined,
	status: DecisionRecordSummaryStatus = 'accepted',
): Promise<readonly RecordSummary[]> {
	const stores = await collectWorkspaceStores();
	const all = await Promise.all(stores.map(async store => {
		const records = await listDecisionRecordSummaries(store.root, status);
		return records
			.filter(record => recordMatchesFilters(record, filters))
			.map(record => ({
				id: record.id,
				title: record.title,
				domain: record.domain,
				enabled: record.enabled,
				...(stores.length > 1 ? { workspace: store.name } : {}),
			} satisfies RecordSummary));
	}));

	return all.flat();
}

async function collectResearch(
	filters: Partial<RecordsState> | undefined,
): Promise<readonly RecordSummary[]> {
	const stores = await collectWorkspaceStores();
	const all = await Promise.all(stores.map(async store => {
		const records = await listResearchSummaries(store.root);
		return records
			.filter(record => researchMatchesFilters(record, filters))
			.map(record => ({
				id: record.id,
				title: record.title,
				domain: record.domain,
				enabled: true,
				summary: record.summary,
				...(stores.length > 1 ? { workspace: store.name } : {}),
			} satisfies RecordSummary));
	}));

	return all.flat();
}

async function collectSpecs(): Promise<readonly RecordSummary[]> {
	const stores = await collectWorkspaceStores();
	const all = await Promise.all(stores.map(async store => {
		const records = await listSidebarSpecSummaries(store.root);
		return records.map(record => ({
			id: record.id,
			title: record.title,
			domain: 'all',
			enabled: true,
			status: record.status,
			...(stores.length > 1 ? { workspace: store.name } : {}),
		} satisfies RecordSummary));
	}));

	return all.flat();
}

async function collectSpecGroups(context: vscode.ExtensionContext): Promise<readonly SpecRecordGroup[]> {
	const stores = await collectWorkspaceStores();
	const collapsed = new Set(context.workspaceState.get<readonly string[]>(specsCollapsedGroupsStateKey) ?? []);
	const all = await Promise.all(stores.map(async store => {
		const groups = await listSidebarSpecGroups(store.root);
		return groups.map(group => ({
			status: group.status,
			records: group.specs.map(spec => ({
				id: spec.id,
				title: spec.title,
				domain: 'all',
				enabled: true,
				status: spec.status,
				...(stores.length > 1 ? { workspace: store.name } : {}),
			} satisfies RecordSummary)),
		}));
	}));

	const groupsByStatus = new Map<string, RecordSummary[]>();
	for (const group of all.flat()) {
		const records = groupsByStatus.get(group.status) ?? [];
		records.push(...group.records);
		groupsByStatus.set(group.status, records);
	}

	return [...groupsByStatus].map(([status, records]) => ({
		status,
		collapsed: collapsed.has(status),
		records: records.sort((left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id)),
	}));
}

async function collectSpecStatusOptions(): Promise<readonly string[]> {
	const stores = await collectWorkspaceStores();
	const statuses: string[] = [];
	for (const lanes of await Promise.all(stores.map(store => listSpecLanes(store.root)))) {
		for (const lane of lanes) {
			pushUnique(statuses, lane);
		}
	}

	if (statuses.length === 0) {
		statuses.push(...defaultSpecLanes);
	}

	return statuses;
}

async function collectSpecWorkspaceOptions(): Promise<readonly string[]> {
	const stores = await collectWorkspaceStores();
	return stores.length <= 1 ? [] : stores.map(store => store.name);
}

async function setSpecGroupCollapsed(
	context: vscode.ExtensionContext,
	status: string,
	collapsed: boolean,
): Promise<void> {
	const statuses = new Set(context.workspaceState.get<readonly string[]>(specsCollapsedGroupsStateKey) ?? []);
	if (collapsed) {
		statuses.add(status);
	} else {
		statuses.delete(status);
	}

	await context.workspaceState.update(specsCollapsedGroupsStateKey, [...statuses].sort());
}

async function collectSpecBoardState(): Promise<SpecsBoardState> {
	const stores = await collectWorkspaceStores();
	const perStore = await Promise.all(stores.map(async store => ({
		store,
		lanes: await listSpecLanes(store.root),
		specs: await listSpecSummaries(store.root),
	})));
	const lanes: string[] = [];
	for (const lane of perStore.flatMap(item => item.lanes)) {
		pushUnique(lanes, lane);
	}
	if (lanes.length === 0) {
		lanes.push(...defaultSpecLanes);
	}

	const specs = perStore.flatMap(item => item.specs.map(spec => ({
		id: spec.id,
		title: spec.title,
		status: spec.status,
		...(stores.length > 1 ? { workspace: item.store.name } : {}),
	} satisfies SpecCard)));

	return {
		lanes,
		specs,
		...(stores.length > 1 ? { workspaces: stores.map(store => store.name) } : {}),
	};
}

async function collectRecordFilterOptions(): Promise<{ domains: readonly string[] }> {
	const stores = await collectWorkspaceStores();
	const all = await Promise.all(stores.map(async store => {
		const [knownDomains, records] = await Promise.all([
			listKnownDomains(store.root),
			listDecisionRecordSummaries(store.root, 'accepted'),
		]);

		return {
			domains: [...knownDomains, ...records.map(record => record.domain)],
		};
	}));

	return {
		domains: sortedUnique(all.flatMap(item => item.domains)).filter(domain => domain !== 'all'),
	};
}

async function collectResearchFilterOptions(): Promise<{ domains: readonly string[] }> {
	const stores = await collectWorkspaceStores();
	const all = await Promise.all(stores.map(async store => {
		const [knownDomains, records] = await Promise.all([
			listKnownDomains(store.root),
			listResearchSummaries(store.root),
		]);

		return {
			domains: [...knownDomains, ...records.map(record => record.domain)],
		};
	}));

	return {
		domains: sortedUnique(all.flatMap(item => item.domains)).filter(domain => domain !== 'all'),
	};
}

function recordMatchesFilters(record: DecisionRecordSummary, filters: Partial<RecordsState> | undefined): boolean {
	return recordMatchesDomain(record.domain, filters?.domainFilter);
}

function researchMatchesFilters(record: ResearchSummary, filters: Partial<RecordsState> | undefined): boolean {
	return recordMatchesDomain(record.domain, filters?.domainFilter);
}

function recordMatchesDomain(recordDomain: string, domainFilter: string | undefined): boolean {
	if (domainFilter === undefined || domainFilter === 'all') {
		return true;
	}

	if (recordDomain === 'all') {
		return true;
	}

	return recordDomain === domainFilter
		|| recordDomain.startsWith(`${domainFilter}.`)
		|| domainFilter.startsWith(`${recordDomain}.`);
}

function sortedUnique(values: readonly string[]): readonly string[] {
	return [...new Set(values.filter(value => value.length > 0))]
		.sort((left, right) => left.localeCompare(right));
}

function pushUnique(values: string[], value: string): void {
	if (value.length > 0 && !values.includes(value)) {
		values.push(value);
	}
}

async function collectCandidates(): Promise<readonly CandidateSummary[]> {
	const stores = await collectWorkspaceStores();
	const all = await Promise.all(stores.map(async store => {
		const candidates = await listCandidateSummaries(store.root);
		return candidates.map(candidate => ({
			id: candidate.id,
			title: candidate.title,
			filePath: candidate.filePath,
			...(stores.length > 1 ? { workspace: store.name } : {}),
		} satisfies CandidateSummary));
	}));

	return all.flat();
}

async function resolveRecordPath(
	record: RecordSummary | undefined,
	status: DecisionRecordSummaryStatus = 'accepted',
): Promise<string | undefined> {
	if (record === undefined) {
		return undefined;
	}

	for (const store of await collectWorkspaceStores()) {
		if (record.workspace !== undefined && record.workspace !== store.name) {
			continue;
		}

		const records = await listDecisionRecordSummaries(store.root, status);
		const match = records.find(item => item.id === record.id);
		if (match !== undefined) {
			return match.filePath;
		}
	}

	return undefined;
}

async function resolveResearchPath(record: RecordSummary | undefined): Promise<string | undefined> {
	if (record === undefined) {
		return undefined;
	}

	for (const store of await collectWorkspaceStores()) {
		if (record.workspace !== undefined && record.workspace !== store.name) {
			continue;
		}

		const records = await listResearchSummaries(store.root);
		const match = records.find(item => item.id === record.id);
		if (match !== undefined) {
			return match.filePath;
		}
	}

	return undefined;
}

async function resolveSpecPath(record: { readonly id: string; readonly workspace?: string } | undefined): Promise<string | undefined> {
	if (record === undefined) {
		return undefined;
	}

	for (const store of await collectWorkspaceStores()) {
		if (record.workspace !== undefined && record.workspace !== store.name) {
			continue;
		}

		const records = await listSpecSummaries(store.root);
		const match = records.find(item => item.id === record.id);
		if (match !== undefined) {
			return match.filePath;
		}
	}

	return undefined;
}

async function previewRecord(id: string | undefined, status: DecisionRecordSummaryStatus = 'accepted'): Promise<void> {
	const record = await recordForCommand(id, status);
	await openMarkdownPreview(await resolveRecordPath(record, status));
}

async function editRecordSource(id: string | undefined, status: DecisionRecordSummaryStatus = 'accepted'): Promise<void> {
	const record = await recordForCommand(id, status);
	await openMarkdownSource(await resolveRecordPath(record, status));
}

async function previewResearch(id: string | undefined): Promise<void> {
	const record = await researchForCommand(id);
	await openMarkdownPreview(await resolveResearchPath(record));
}

async function editResearchSource(id: string | undefined): Promise<void> {
	const record = await researchForCommand(id);
	await openMarkdownSource(await resolveResearchPath(record));
}

async function openSpec(id: string | undefined, workspace?: string): Promise<void> {
	const record = await specForCommand(id, workspace);
	const filePath = await resolveSpecPath(record);
	if (filePath === undefined) {
		return;
	}

	await openMarkdownSource(filePath);
}

async function launchSpecSession(phase: SpecSessionPhase, id: string | undefined, workspace?: string): Promise<void> {
	const record = await specForCommand(id, workspace);
	const filePath = await resolveSpecPath(record);
	if (record === undefined || filePath === undefined) {
		return;
	}

	const provider = await pickSpecSessionProvider();
	if (provider === undefined) {
		return;
	}

	const spec: SpecSessionSpec = {
		id: record.id,
		title: record.title,
		filePath,
	};
	let result: SpecSessionLaunchResult;
	try {
		result = await launchProviderSpecSession(provider, phase, spec, await fs.readFile(filePath, 'utf8'));
	} catch (error) {
		void vscode.window.showErrorMessage(`Unable to launch ${providerDisplayName(provider)} for ${record.id}: ${errorMessage(error)}`);
		return;
	}

	showSpecSessionLaunchResult(result, phase, spec);
}

async function pickSpecSessionProvider(): Promise<SpecSessionProvider | undefined> {
	const installed = installedSpecSessionProviders();
	if (installed.length === 1) {
		return installed[0];
	}

	if (installed.length === 2) {
		const pick = await vscode.window.showQuickPick<SpecSessionProviderPick>(installed.map(provider => ({
			label: providerDisplayName(provider),
			description: provider === 'claude'
				? 'Open a Claude Code tab with the prompt prefilled'
				: 'Hand off through Codex Implement Todo',
			provider,
		})), {
			placeHolder: 'Select a provider for this spec session',
		});
		return pick?.provider;
	}

	const action = await vscode.window.showWarningMessage(
		'Install Claude Code or Codex to launch a Sundial spec session.',
		'Open Claude Code',
		'Open Codex',
	);
	if (action === 'Open Claude Code') {
		await openExtensionSearch('anthropic.claude-code');
	}

	if (action === 'Open Codex') {
		await openExtensionSearch('openai.chatgpt');
	}

	return undefined;
}

async function launchProviderSpecSession(
	provider: SpecSessionProvider,
	phase: SpecSessionPhase,
	spec: SpecSessionSpec,
	markdown: string,
): Promise<SpecSessionLaunchResult> {
	if (!isSpecSessionProviderInstalled(provider)) {
		return { kind: 'unavailable', provider, reason: 'missing-extension' };
	}

	if (provider === 'claude') {
		const prompt = buildProviderSpecSessionPrompt(provider, phase, spec);
		const uri = buildClaudeSpecSessionUri(phase, spec);
		const opened = await vscode.env.openExternal(vscode.Uri.parse(uri));
		return opened
			? { kind: 'prefilled', provider, uri, prompt }
			: { kind: 'unavailable', provider, reason: 'launch-failed' };
	}

	if (phase !== 'implementation') {
		const prompt = buildProviderSpecSessionPrompt(provider, phase, spec);
		await vscode.env.clipboard.writeText(prompt);
		await vscode.commands.executeCommand('chatgpt.newCodexPanel');
		return { kind: 'codex-clipboard-handoff', provider, prompt };
	}

	const args = buildCodexSpecSessionArguments(phase, spec, markdown);
	await vscode.commands.executeCommand('chatgpt.implementTodo', args);
	return { kind: 'codex-todo-handoff', provider, args };
}

function showSpecSessionLaunchResult(result: SpecSessionLaunchResult, phase: SpecSessionPhase, spec: SpecSessionSpec): void {
	if (result.kind === 'prefilled') {
		void vscode.window.showInformationMessage(`${providerDisplayName(result.provider)} opened with the ${phase} prompt for ${spec.id} prefilled.`);
		return;
	}

	if (result.kind === 'codex-todo-handoff') {
		void vscode.window.showInformationMessage(`${providerDisplayName(result.provider)} opened with the ${phase} handoff for ${spec.id}.`);
		return;
	}

	if (result.kind === 'codex-clipboard-handoff') {
		void vscode.window.showInformationMessage(`${providerDisplayName(result.provider)} opened with the ${phase} prompt for ${spec.id} copied to the clipboard.`);
		return;
	}

	const provider = result.provider === undefined ? 'A supported provider' : providerDisplayName(result.provider);
	const reason = result.reason === 'missing-extension' ? 'is not installed' : 'could not be opened';
	void vscode.window.showWarningMessage(`${provider} ${reason}.`);
}

function installedSpecSessionProviders(): readonly SpecSessionProvider[] {
	return (['claude', 'codex'] as const).filter(provider => isSpecSessionProviderInstalled(provider));
}

function isSpecSessionProviderInstalled(provider: SpecSessionProvider): boolean {
	const extensionId = provider === 'claude' ? 'anthropic.claude-code' : 'openai.chatgpt';
	return vscode.extensions.getExtension(extensionId) !== undefined;
}

async function openExtensionSearch(extensionId: string): Promise<void> {
	await vscode.commands.executeCommand('workbench.extensions.search', `@id:${extensionId}`);
}

function providerDisplayName(provider: SpecSessionProvider): string {
	return provider === 'claude' ? 'Claude Code' : 'Codex';
}

async function createSpec(
	title: string,
	status: string,
	workspace: string | undefined,
	specsProvider: RecordsWebviewProvider,
	specsBoardPanel: SpecsBoardPanel,
): Promise<void> {
	const root = await specWorkspaceRootForCommand(workspace);
	if (root === undefined) {
		return;
	}

	try {
		const output = await runSundial(root, ['spec', 'create', '--title', title, '--status', status]);
		const createdPath = pathFromCommandOutput(root, output);
		await refreshSpecViews(specsProvider, specsBoardPanel);
		await openMarkdownSource(createdPath);
	} catch (error) {
		showCommandError(error);
	}
}

function pathFromCommandOutput(root: string, output: string): string | undefined {
	const match = /^Path:\s*(.+)$/m.exec(output);
	if (match === null) {
		return undefined;
	}

	const outputPath = match[1].trim();
	return path.isAbsolute(outputPath)
		? outputPath
		: path.join(root, ...outputPath.split('/'));
}

async function moveSpec(
	id: string,
	status: string,
	workspace: string | undefined,
	specsProvider: RecordsWebviewProvider,
	specsBoardPanel: SpecsBoardPanel,
): Promise<void> {
	const record = await specForCommand(id, workspace);
	const filePath = await resolveSpecPath(record);
	if (record === undefined || filePath === undefined) {
		return;
	}

	await runLifecycle(record.id, ['spec', 'status', record.id, status], filePath);
	await refreshSpecViews(specsProvider, specsBoardPanel);
}

async function deleteSpec(
	id: string,
	workspace: string | undefined,
	specsProvider: RecordsWebviewProvider,
	specsBoardPanel: SpecsBoardPanel,
	skipConfirmation = false,
): Promise<void> {
	const record = await specForCommand(id, workspace);
	const filePath = await resolveSpecPath(record);
	if (record === undefined || filePath === undefined) {
		return;
	}

	if (!skipConfirmation) {
		const action = await vscode.window.showWarningMessage(
			`Delete ${record.id}? This removes ${path.basename(filePath)} from disk.`,
			{ modal: true },
			'Delete File',
		);
		if (action !== 'Delete File') {
			return;
		}
	}

	await runLifecycle(record.id, ['spec', 'delete', record.id], filePath);
	await refreshSpecViews(specsProvider, specsBoardPanel);
}

async function previewCandidate(id: string | undefined, filePath?: string): Promise<void> {
	const target = await candidatePathForCommand(id, filePath);
	await openMarkdownPreview(target?.filePath);
}

async function editCandidateSource(id: string | undefined, filePath?: string): Promise<void> {
	const target = await candidatePathForCommand(id, filePath);
	await openMarkdownSource(target?.filePath);
}

async function acceptCandidate(
	id: string | undefined,
	filePath: string | undefined,
	welcomeProvider: WelcomeWebviewProvider,
	candidatesProvider: CandidatesWebviewProvider,
	recordsProvider: RecordsWebviewProvider,
	rejectedRecordsProvider: RecordsWebviewProvider,
	retiredRecordsProvider: RecordsWebviewProvider,
): Promise<void> {
	const target = await candidatePathForCommand(id, filePath);
	if (target === undefined) {
		return;
	}

	await runLifecycle(target.id, ['candidate', 'accept', target.id], target.filePath);
	await refreshGovernanceViews(welcomeProvider, candidatesProvider, recordsProvider, rejectedRecordsProvider, retiredRecordsProvider);
}

async function rejectCandidate(
	id: string | undefined,
	filePath: string | undefined,
	welcomeProvider: WelcomeWebviewProvider,
	candidatesProvider: CandidatesWebviewProvider,
	recordsProvider: RecordsWebviewProvider,
	rejectedRecordsProvider: RecordsWebviewProvider,
	retiredRecordsProvider: RecordsWebviewProvider,
	reasonOverride?: string,
): Promise<void> {
	const target = await candidatePathForCommand(id, filePath);
	if (target === undefined) {
		return;
	}

	const reason = reasonOverride ?? await vscode.window.showInputBox({ prompt: 'Reason for rejecting this candidate' });
	if (reason === undefined) {
		return;
	}

	const args = ['candidate', 'reject', target.id, ...(reason.length === 0 ? [] : ['--reason', reason])];
	await runLifecycle(target.id, args, target.filePath);
	await refreshGovernanceViews(welcomeProvider, candidatesProvider, recordsProvider, rejectedRecordsProvider, retiredRecordsProvider);
}

async function retireCandidate(
	id: string | undefined,
	filePath: string | undefined,
	welcomeProvider: WelcomeWebviewProvider,
	candidatesProvider: CandidatesWebviewProvider,
	recordsProvider: RecordsWebviewProvider,
	rejectedRecordsProvider: RecordsWebviewProvider,
	retiredRecordsProvider: RecordsWebviewProvider,
	retiredByOverride?: string,
): Promise<void> {
	const target = await candidatePathForCommand(id, filePath);
	if (target === undefined) {
		return;
	}

	const retiredBy = retiredByOverride ?? await vscode.window.showInputBox({ prompt: 'Successor DR or candidate id (optional)' });
	if (retiredBy === undefined) {
		return;
	}

	const retiredByArg = retiredBy.trim();
	await runLifecycle(target.id, ['candidate', 'retire', target.id, ...(retiredByArg.length === 0 ? [] : ['--by', retiredByArg])], target.filePath);
	await refreshGovernanceViews(welcomeProvider, candidatesProvider, recordsProvider, rejectedRecordsProvider, retiredRecordsProvider);
}

async function dismissCandidate(
	id: string | undefined,
	filePath: string | undefined,
	welcomeProvider: WelcomeWebviewProvider,
	candidatesProvider: CandidatesWebviewProvider,
	recordsProvider: RecordsWebviewProvider,
	rejectedRecordsProvider: RecordsWebviewProvider,
	retiredRecordsProvider: RecordsWebviewProvider,
	skipConfirmation = false,
): Promise<void> {
	const target = await candidatePathForCommand(id, filePath);
	if (target === undefined) {
		return;
	}

	if (!skipConfirmation) {
		const action = await vscode.window.showWarningMessage(
			`Dismiss ${target.id}? This deletes ${path.basename(target.filePath)} without adding it to rejected history.`,
			{ modal: true },
			'Dismiss',
		);
		if (action !== 'Dismiss') {
			return;
		}
	}

	await runLifecycle(target.id, ['candidate', 'dismiss', target.id], target.filePath);
	await refreshGovernanceViews(welcomeProvider, candidatesProvider, recordsProvider, rejectedRecordsProvider, retiredRecordsProvider);
}

async function setRecordEnabled(
	id: string,
	enabled: boolean,
	onLifecycleCompleted: () => Promise<void>,
): Promise<void> {
	const record = await recordForCommand(id, 'accepted');
	const filePath = await resolveRecordPath(record, 'accepted');
	if (record === undefined || filePath === undefined) {
		return;
	}

	await runLifecycle(record.id, ['dr', enabled ? 'enable' : 'disable', record.id], filePath);
	await onLifecycleCompleted();
}

async function retireRecord(
	id: string,
	onLifecycleCompleted: () => Promise<void>,
	retiredByOverride?: string,
): Promise<void> {
	const record = await recordForCommand(id, 'accepted');
	const filePath = await resolveRecordPath(record, 'accepted');
	if (record === undefined || filePath === undefined) {
		return;
	}

	const retiredBy = retiredByOverride ?? await vscode.window.showInputBox({ prompt: 'Successor DR or candidate id (optional)' });
	if (retiredBy === undefined) {
		return;
	}

	const retiredByArg = retiredBy.trim();
	await runLifecycle(record.id, ['dr', 'retire', record.id, ...(retiredByArg.length === 0 ? [] : ['--by', retiredByArg])], filePath);
	await onLifecycleCompleted();
}

async function promoteRecord(
	id: string,
	status: Exclude<DecisionRecordSummaryStatus, 'accepted'>,
	onLifecycleCompleted: () => Promise<void>,
): Promise<void> {
	const record = await recordForCommand(id, status);
	const filePath = await resolveRecordPath(record, status);
	if (record === undefined || filePath === undefined) {
		return;
	}

	await runLifecycle(record.id, ['dr', 'promote', record.id, '--from', status], filePath);
	await onLifecycleCompleted();
}

async function deleteRecord(
	id: string,
	status: Exclude<DecisionRecordSummaryStatus, 'accepted'>,
	onLifecycleCompleted: () => Promise<void>,
	skipConfirmation = false,
): Promise<void> {
	const record = await recordForCommand(id, status);
	const filePath = await resolveRecordPath(record, status);
	if (record === undefined || filePath === undefined) {
		return;
	}

	if (!skipConfirmation) {
		const action = await vscode.window.showWarningMessage(
			`Delete ${record.id} from ${status} decision record history? This removes ${path.basename(filePath)} from disk.`,
			{ modal: true },
			'Delete File',
		);
		if (action !== 'Delete File') {
			return;
		}
	}

	await runLifecycle(record.id, ['dr', 'delete', record.id, '--from', status], filePath);
	await onLifecycleCompleted();
}

async function refreshGovernanceViews(
	welcomeProvider: WelcomeWebviewProvider,
	candidatesProvider: CandidatesWebviewProvider,
	recordsProvider: RecordsWebviewProvider,
	rejectedRecordsProvider: RecordsWebviewProvider,
	retiredRecordsProvider: RecordsWebviewProvider,
	researchProvider?: RecordsWebviewProvider,
	specsProvider?: RecordsWebviewProvider,
): Promise<void> {
	await candidatesProvider.refresh();
	await recordsProvider.refresh();
	await researchProvider?.refresh();
	await specsProvider?.refresh();
	await rejectedRecordsProvider.refresh();
	await retiredRecordsProvider.refresh();
	await refreshWorkspaceState(welcomeProvider);
}

async function refreshSpecViews(
	specsProvider: RecordsWebviewProvider,
	specsBoardPanel: SpecsBoardPanel,
): Promise<void> {
	await specsProvider.refresh();
	await specsBoardPanel.refresh();
}

interface RecordPick extends vscode.QuickPickItem {
	readonly record: RecordSummary;
}

async function recordForCommand(
	id: string | undefined,
	status: DecisionRecordSummaryStatus = 'accepted',
): Promise<RecordSummary | undefined> {
	const records = await collectRecords(undefined, status);
	if (id !== undefined) {
		const match = records.find(record => record.id === id);
		if (match === undefined) {
			void vscode.window.showWarningMessage(`No decision record found with id "${id}".`);
		}

		return match;
	}

	if (records.length === 0) {
		void vscode.window.showInformationMessage(`No ${status} decision records are available.`);
		return undefined;
	}

	const pick = await vscode.window.showQuickPick<RecordPick>(records.map(record => ({
		label: record.title,
		description: record.workspace === undefined ? record.id : `${record.id} - ${record.workspace}`,
		record,
	})), {
		placeHolder: 'Select a decision record',
	});
	return pick?.record;
}

async function researchForCommand(id: string | undefined): Promise<RecordSummary | undefined> {
	const records = await collectResearch(undefined);
	if (id !== undefined) {
		const match = records.find(record => record.id === id);
		if (match === undefined) {
			void vscode.window.showWarningMessage(`No research note found with id "${id}".`);
		}

		return match;
	}

	if (records.length === 0) {
		void vscode.window.showInformationMessage('No research notes are available.');
		return undefined;
	}

	const pick = await vscode.window.showQuickPick<RecordPick>(records.map(record => ({
		label: record.title,
		description: record.workspace === undefined ? record.id : `${record.id} - ${record.workspace}`,
		record,
	})), {
		placeHolder: 'Select a research note',
	});
	return pick?.record;
}

async function specForCommand(id: string | undefined, workspace?: string): Promise<RecordSummary | undefined> {
	const records = await collectSpecs();
	if (id !== undefined) {
		const match = records.find(record => record.id === id && (workspace === undefined || record.workspace === workspace));
		if (match === undefined) {
			void vscode.window.showWarningMessage(`No spec found with id "${id}".`);
		}

		return match;
	}

	if (records.length === 0) {
		void vscode.window.showInformationMessage('No specs are available.');
		return undefined;
	}

	const pick = await vscode.window.showQuickPick<RecordPick>(records.map(record => ({
		label: record.title,
		description: record.workspace === undefined ? record.id : `${record.id} - ${record.workspace}`,
		record,
	})), {
		placeHolder: 'Select a spec',
	});
	return pick?.record;
}

async function specWorkspaceRootForCommand(workspace: string | undefined): Promise<string | undefined> {
	const stores = await collectWorkspaceStores();
	if (workspace !== undefined) {
		const match = stores.find(store => store.name === workspace);
		if (match === undefined) {
			void vscode.window.showWarningMessage(`No Sundial workspace found for "${workspace}".`);
		}

		return match?.root;
	}

	if (stores.length === 0) {
		void vscode.window.showInformationMessage('No initialized Sundial workspace is available.');
		return undefined;
	}

	if (stores.length === 1) {
		return stores[0].root;
	}

	const pick = await vscode.window.showQuickPick<WorkspaceRootPick>(stores.map(store => ({
		label: store.name,
		description: store.root,
		root: store.root,
	})), {
		placeHolder: 'Select a Sundial workspace',
	});

	return pick?.root;
}

interface CandidatePick extends vscode.QuickPickItem {
	readonly candidate: CandidateSummary;
}

interface CandidatePathTarget {
	readonly id: string;
	readonly filePath: string;
}

async function candidatePathForCommand(id: string | undefined, filePath?: string): Promise<CandidatePathTarget | undefined> {
	if (filePath !== undefined) {
		const target = await candidatePathTargetFromFilePath(id, filePath);
		if (target !== undefined) {
			return target;
		}

		void vscode.window.showWarningMessage(`No candidate file found for id "${id ?? path.basename(filePath, '.md')}".`);
		return undefined;
	}

	const candidate = await candidateForCommand(id);
	if (candidate === undefined) {
		return undefined;
	}

	if (candidate.filePath === undefined) {
		void vscode.window.showWarningMessage(`No candidate file found for id "${candidate.id}".`);
		return undefined;
	}

	return { id: candidate.id, filePath: candidate.filePath };
}

async function candidatePathTargetFromFilePath(id: string | undefined, filePath: string): Promise<CandidatePathTarget | undefined> {
	const resolvedFilePath = path.resolve(filePath);

	for (const store of await collectWorkspaceStores()) {
		const candidates = await listCandidateSummaries(store.root);
		const match = candidates.find(candidate => {
			return path.resolve(candidate.filePath) === resolvedFilePath
				&& (id === undefined || candidate.id === id);
		});
		if (match !== undefined) {
			return { id: match.id, filePath: match.filePath };
		}
	}

	return undefined;
}

async function candidateForCommand(id: string | undefined): Promise<CandidateSummary | undefined> {
	const candidates = await collectCandidates();
	if (id !== undefined) {
		const match = candidates.find(candidate => candidate.id === id);
		if (match === undefined) {
			void vscode.window.showWarningMessage(`No candidate found with id "${id}".`);
		}

		return match;
	}

	if (candidates.length === 0) {
		void vscode.window.showInformationMessage('No active candidates are available.');
		return undefined;
	}

	const pick = await vscode.window.showQuickPick<CandidatePick>(candidates.map(candidate => ({
		label: candidate.title,
		description: candidate.workspace === undefined ? candidate.id : `${candidate.id} - ${candidate.workspace}`,
		candidate,
	})), {
		placeHolder: 'Select a candidate',
	});
	return pick?.candidate;
}

async function openMarkdownSource(filePath: string | undefined): Promise<void> {
	if (filePath === undefined) {
		return;
	}

	const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
	await vscode.window.showTextDocument(document);
}

async function openMarkdownPreview(filePath: string | undefined): Promise<void> {
	if (filePath === undefined) {
		return;
	}

	const uri = activeMarkdownPreviewProvider === undefined
		? vscode.Uri.file(filePath)
		: await activeMarkdownPreviewProvider.previewUriForFile(filePath);
	await vscode.commands.executeCommand('markdown.showPreview', uri);
}

interface ProviderPick extends vscode.QuickPickItem {
	readonly provider: BootstrapProvider;
}

interface SpecSessionProviderPick extends vscode.QuickPickItem {
	readonly provider: SpecSessionProvider;
}

interface WorkspaceRootPick extends vscode.QuickPickItem {
	readonly root: string;
}

type WorkspaceRootState = 'any' | 'initialized' | 'uninitialized';

interface AgentSelection {
	readonly claude: boolean;
	readonly codex: boolean;
}

async function initializeProject(
	welcomeProvider: WelcomeWebviewProvider,
	candidatesProvider: CandidatesWebviewProvider,
	recordsProvider: RecordsWebviewProvider,
	researchProvider: RecordsWebviewProvider,
	specsProvider: RecordsWebviewProvider,
	specsBoardPanel: SpecsBoardPanel,
	rejectedRecordsProvider: RecordsWebviewProvider,
	retiredRecordsProvider: RecordsWebviewProvider,
	agents: AgentSelection,
): Promise<void> {
	if (!await isCliAvailable()) {
		const action = await vscode.window.showErrorMessage('Install the Sundial CLI before initializing this project.', 'Install CLI');
		if (action === 'Install CLI') {
			await vscode.commands.executeCommand('sundial.installCli');
		}

		return;
	}

	const root = await chooseWorkspaceRoot('uninitialized');
	if (root === undefined) {
		void vscode.window.showErrorMessage('Open an uninitialized workspace folder before initializing Sundial.');
		return;
	}

	const agentArgs = [...(agents.claude ? ['--claude'] : []), ...(agents.codex ? ['--codex'] : [])];

	runSundialInTerminal(
		root,
		['--cwd', root, 'init', '--root', root, ...agentArgs],
		'Sundial Initialize',
		async exitCode => {
			await candidatesProvider.refresh();
			await recordsProvider.refresh();
			await researchProvider.refresh();
			await specsProvider.refresh();
			await specsBoardPanel.refresh();
			await rejectedRecordsProvider.refresh();
			await retiredRecordsProvider.refresh();
			await refreshWorkspaceState(welcomeProvider);
			if (exitCode !== 0) {
				void vscode.window.showErrorMessage(`Sundial initialization failed with exit code ${exitCode ?? 'unknown'}. See the terminal for details.`);
				return;
			}

			const bootstrapChoice = await vscode.window.showInformationMessage('Sundial project initialized.', 'Bootstrap decisions');
			if (bootstrapChoice === 'Bootstrap decisions') {
				await bootstrap(candidatesProvider, root);
			}
		},
	);

	scheduleWorkspaceRefresh(welcomeProvider, candidatesProvider, recordsProvider, researchProvider, specsProvider, rejectedRecordsProvider, retiredRecordsProvider);
	void vscode.window.showInformationMessage('Sundial initialization started in the terminal.');
}

async function installCli(welcomeProvider: WelcomeWebviewProvider): Promise<void> {
	const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	runCommandInTerminal(
		cwd,
		'npm',
		sundialCliInstallArgs(),
		'Sundial CLI Install',
		async exitCode => {
			await refreshWorkspaceState(welcomeProvider);
			if (exitCode !== 0) {
				void vscode.window.showErrorMessage(`Sundial CLI installation failed with exit code ${exitCode ?? 'unknown'}. See the terminal for details.`);
				return;
			}

			void vscode.window.showInformationMessage('Sundial CLI installed.');
		},
	);
	scheduleCliAvailabilityRefresh(welcomeProvider);
	void vscode.window.showInformationMessage('Sundial CLI installation started in the terminal.');
}

function scheduleCliAvailabilityRefresh(welcomeProvider: WelcomeWebviewProvider): void {
	for (const delay of [5000, 15000, 30000]) {
		setTimeout(() => {
			void refreshWorkspaceState(welcomeProvider);
		}, delay);
	}
}

function scheduleWorkspaceRefresh(
	welcomeProvider: WelcomeWebviewProvider,
	candidatesProvider: CandidatesWebviewProvider,
	recordsProvider: RecordsWebviewProvider,
	researchProvider: RecordsWebviewProvider,
	specsProvider: RecordsWebviewProvider,
	rejectedRecordsProvider: RecordsWebviewProvider,
	retiredRecordsProvider: RecordsWebviewProvider,
): void {
	for (const delay of [1500, 5000]) {
		setTimeout(() => {
			void candidatesProvider.refresh();
			void recordsProvider.refresh();
			void researchProvider.refresh();
			void specsProvider.refresh();
			void rejectedRecordsProvider.refresh();
			void retiredRecordsProvider.refresh();
			void refreshWorkspaceState(welcomeProvider);
		}, delay);
	}
}

function runSundialInTerminal(
	root: string,
	args: readonly string[],
	name: string,
	onExit?: (exitCode: number | undefined) => void | Promise<void>,
): vscode.Terminal {
	return runCommandInTerminal(root, cliPath(), args, name, onExit);
}

function runCommandInTerminal(
	cwd: string | undefined,
	command: string,
	args: readonly string[],
	name: string,
	onExit?: (exitCode: number | undefined) => void | Promise<void>,
): vscode.Terminal {
	const terminalOptions: vscode.TerminalOptions = { name };
	if (cwd !== undefined) {
		terminalOptions.cwd = cwd;
	}

	const terminal = vscode.window.createTerminal(terminalOptions);
	const commandLine = [shellQuote(command), ...args.map(shellQuote)].join(' ');
	let started = false;
	let fallbackTimer: ReturnType<typeof setTimeout> | undefined;

	const startWithShellIntegration = (shellIntegration: vscode.TerminalShellIntegration): void => {
		if (started) {
			return;
		}

		started = true;
		if (fallbackTimer !== undefined) {
			clearTimeout(fallbackTimer);
		}

		const execution = shellIntegration.executeCommand(command, [...args]);
		const exitListener = vscode.window.onDidEndTerminalShellExecution(event => {
			if (event.execution !== execution) {
				return;
			}

			exitListener.dispose();
			void onExit?.(event.exitCode);
		});
	};

	terminal.show();

	if (terminal.shellIntegration !== undefined) {
		startWithShellIntegration(terminal.shellIntegration);
		return terminal;
	}

	const integrationListener = vscode.window.onDidChangeTerminalShellIntegration(event => {
		if (event.terminal !== terminal) {
			return;
		}

		integrationListener.dispose();
		startWithShellIntegration(event.shellIntegration);
	});

	fallbackTimer = setTimeout(() => {
		if (started) {
			return;
		}

		started = true;
		integrationListener.dispose();
		terminal.sendText(commandLine);
	}, 3000);

	return terminal;
}

async function bootstrap(
	candidatesProvider: CandidatesWebviewProvider,
	selectedRoot?: string,
	selectedProvider?: BootstrapProvider,
): Promise<void> {
	const root = selectedRoot ?? await chooseWorkspaceRoot('initialized');
	if (root === undefined) {
		void vscode.window.showErrorMessage('Open an initialized workspace folder before running Sundial bootstrap.');
		return;
	}

	const provider = selectedProvider ?? await pickBootstrapProvider();
	if (provider === undefined) {
		return;
	}

	runSundialInTerminal(
		root,
		['--cwd', root, 'bootstrap', '--provider', provider],
		`Sundial Bootstrap (${provider})`,
		async () => {
			await candidatesProvider.refresh();
			await updateWorkspaceState();
		},
	);
	await candidatesProvider.refresh();
	await updateWorkspaceState();
}

async function pickBootstrapProvider(): Promise<BootstrapProvider | undefined> {
	const installed = await collectInstalledProviders();
	if (installed.length === 1) {
		return installed[0];
	}

	const candidates: readonly { provider: BootstrapProvider; label: string; description: string }[] = installed.length === 0
		? [
			{ provider: 'claude', label: 'Claude Code', description: 'Use the claude CLI' },
			{ provider: 'codex', label: 'Codex', description: 'Use the codex CLI' },
		]
		: installed.map(provider => provider === 'claude'
			? { provider, label: 'Claude Code', description: 'Use the claude CLI' }
			: { provider, label: 'Codex', description: 'Use the codex CLI' });

	const picked = await vscode.window.showQuickPick<ProviderPick>(candidates, {
		placeHolder: 'Select the LLM CLI to inspect the project and create candidates',
	});
	return picked?.provider;
}

async function collectInstalledProviders(): Promise<readonly BootstrapProvider[]> {
	const stores = await collectWorkspaceStores();
	const seen = new Set<BootstrapProvider>();
	for (const store of stores) {
		const [hasClaude, hasCodex] = await Promise.all([
			directoryExists(path.join(store.root, '.claude')),
			fileExists(path.join(store.root, 'AGENTS.md')),
		]);
		if (hasClaude) {
			seen.add('claude');
		}

		if (hasCodex) {
			seen.add('codex');
		}
	}

	return ['claude', 'codex'].filter((provider): provider is BootstrapProvider => seen.has(provider as BootstrapProvider));
}

async function directoryExists(dirPath: string): Promise<boolean> {
	try {
		const stat = await fs.stat(dirPath);
		return stat.isDirectory();
	} catch (error) {
		if (isNodeError(error) && error.code === 'ENOENT') {
			return false;
		}

		throw error;
	}
}

async function runLifecycle(_id: string, args: readonly string[], filePath: string): Promise<void> {
	const root = await workspaceRootForPath(filePath);
	if (root === undefined) {
		return;
	}

	try {
		await runSundial(root, args);
	} catch (error) {
		showCommandError(error);
	}
}

async function workspaceRootForPath(filePath: string): Promise<string | undefined> {
	const stores = await collectWorkspaceStores();
	const match = stores.find(store => filePath.startsWith(`${store.root}${path.sep}`) || filePath === store.root);
	return match?.root;
}

async function runSundial(root: string, args: readonly string[]): Promise<string> {
	const { stdout, stderr } = await execFileAsync(cliPath(), ['--cwd', root, ...args], { cwd: root });
	return `${stdout}${stderr}`;
}

async function isCliAvailable(): Promise<boolean> {
	try {
		await execFileAsync(cliPath(), ['help'], { timeout: 5000 });
		return true;
	} catch {
		return false;
	}
}

function cliPath(): string {
	return vscode.workspace.getConfiguration('sundial').get('cliPath', sundialCliCommand);
}

function isIntegrationTest(): boolean {
	return process.env.VSCODE_TEST_OPTIONS !== undefined;
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch (error) {
		if (isNodeError(error) && error.code === 'ENOENT') {
			return false;
		}

		throw error;
	}
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && 'code' in error;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function showCommandError(error: unknown): void {
	void vscode.window.showErrorMessage(`Sundial command failed: ${errorMessage(error)}`);
}

async function chooseWorkspaceRoot(state: WorkspaceRootState): Promise<string | undefined> {
	const folders = vscode.workspace.workspaceFolders;
	if (folders === undefined || folders.length === 0) {
		return undefined;
	}

	const seen = new Set<string>();
	const candidates = (await Promise.all(folders.map(async folder => {
		const discoveredRoot = await discoverSundialRoot(folder.uri.fsPath);
		const root = discoveredRoot ?? folder.uri.fsPath;
		return {
			folder,
			root,
			initialized: discoveredRoot !== undefined,
			name: discoveredRoot === undefined || discoveredRoot === folder.uri.fsPath ? folder.name : path.basename(discoveredRoot),
		};
	}))).filter(candidate => {
		if (state === 'initialized') {
			return candidate.initialized;
		}

		if (state === 'uninitialized') {
			return !candidate.initialized;
		}

		return true;
	}).filter(candidate => {
		if (seen.has(candidate.root)) {
			return false;
		}

		seen.add(candidate.root);
		return true;
	});

	if (candidates.length === 1) {
		return candidates[0].root;
	}

	const pick = await vscode.window.showQuickPick<WorkspaceRootPick>(candidates.map(candidate => ({
		label: candidate.name,
		description: candidate.root,
		root: candidate.root,
	})), {
		placeHolder: state === 'initialized'
			? 'Select an initialized Sundial project root'
			: 'Select the project root for Sundial bootstrap',
	});

	return pick?.root;
}

async function updateWorkspaceState(): Promise<void> {
	const folders = vscode.workspace.workspaceFolders ?? [];
	const discoveredRoots = await Promise.all(folders.map(folder => discoverSundialRoot(folder.uri.fsPath)));
	const anyInitialized = discoveredRoots.some(root => root !== undefined);
	const anyUninitialized = folders.length > 0 && discoveredRoots.some(root => root === undefined);
	const cliAvailable = await isCliAvailable();
	const stores = await collectWorkspaceStores();
	const hasCandidates = (await Promise.all(stores.map(async store => (await listCandidateSummaries(store.root)).length > 0))).some(Boolean);

	await vscode.commands.executeCommand('setContext', 'sundial.workspaceInitialized', anyInitialized);
	await vscode.commands.executeCommand('setContext', 'sundial.workspaceUninitialized', anyUninitialized);
	await vscode.commands.executeCommand('setContext', 'sundial.hasCandidates', hasCandidates);
	await vscode.commands.executeCommand('setContext', 'sundial.cliAvailable', cliAvailable);
}

async function refreshWorkspaceState(welcomeProvider: WelcomeWebviewProvider): Promise<void> {
	await updateWorkspaceState();
	await welcomeProvider.refresh();
}

async function runFilterByDomain(state: RecordsState, recordsProvider: RecordsWebviewProvider): Promise<void> {
	const root = await chooseWorkspaceRoot('initialized');
	if (root === undefined) {
		return;
	}

	const records = await listDecisionRecordSummaries(root, 'accepted');
	const knownDomains = await listKnownDomains(root);
	const domains = sortedUnique([...knownDomains, ...records.map(record => record.domain)])
		.filter(domain => domain !== 'all');
	const picked = await vscode.window.showQuickPick(domains, {
		placeHolder: 'Filter Decision Records by domain',
	});

	if (picked !== undefined) {
		state.domainFilter = normalizeFilterValue(picked);
		await recordsProvider.refresh();
	}
}

function normalizeFilterValue(value: string | undefined): string | undefined {
	if (value === undefined || value.length === 0 || value === 'all') {
		return undefined;
	}

	return value;
}

function clearRecordFilters(state: RecordsState): void {
	state.domainFilter = undefined;
}

function shellQuote(value: string): string {
	return `'${value.replaceAll('\'', '\'\\\'\'')}'`;
}
