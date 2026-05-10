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
	listKnownTags,
	type DecisionRecordSummary,
	type DecisionRecordSummaryStatus,
} from './candidateInbox';
import { WelcomeWebviewProvider } from './webviews/welcome/welcomeWebviewProvider';
import { RecordsWebviewProvider } from './webviews/records/recordsWebviewProvider';
import { CandidatesWebviewProvider } from './webviews/candidates/candidatesWebviewProvider';
import type { RecordRenderDiagnostic, RecordSummary } from './webviews/records/messages';
import type { BootstrapProvider, CandidateRenderDiagnostic, CandidateSummary } from './webviews/candidates/messages';
import type { WebviewToHost as WelcomeWebviewToHost, WelcomeRenderDiagnostic } from './webviews/welcome/messages';
import { renderMarkdownPreviewSource } from './markdownPreview';
import { sundialCliCommand, sundialCliInstallArgs } from './sundialCli';

const execFileAsync = promisify(execFile);
const markdownPreviewScheme = 'sundial-preview';
let activeMarkdownPreviewProvider: FrontmatterMarkdownPreviewProvider | undefined;

interface RecordsState {
	domainFilter: string | undefined;
	tagFilter: string | undefined;
}

interface WorkspaceStore {
	readonly root: string;
	readonly name: string;
}

interface RecordsDiagnostics {
	lastState?: {
		readonly recordCount: number;
		readonly domainFilter?: string;
		readonly tagFilter?: string;
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

interface WelcomeDiagnostics {
	lastRendered?: WelcomeRenderDiagnostic;
	lastCommand?: WelcomeWebviewToHost;
}

export function activate(context: vscode.ExtensionContext): void {
	const recordsState: RecordsState = { domainFilter: undefined, tagFilter: undefined };
	const recordsDiagnostics: RecordsDiagnostics = {};
	const rejectedRecordsDiagnostics: RecordsDiagnostics = {};
	const retiredRecordsDiagnostics: RecordsDiagnostics = {};
	const candidatesDiagnostics: CandidatesDiagnostics = {};
	const welcomeDiagnostics: WelcomeDiagnostics = {};
	const diagnosticsEnabled = isIntegrationTest();
	const diagnosticsChannel = vscode.window.createOutputChannel('Sundial Diagnostics');
	context.subscriptions.push(diagnosticsChannel);
	const markdownPreviewProvider = new FrontmatterMarkdownPreviewProvider();
	activeMarkdownPreviewProvider = markdownPreviewProvider;
	context.subscriptions.push(markdownPreviewProvider);
	context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(markdownPreviewScheme, markdownPreviewProvider));
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
	const refreshGovernance = async (): Promise<void> => {
		await refreshGovernanceViews(welcomeProvider, candidatesProvider, recordsProvider, rejectedRecordsProvider, retiredRecordsProvider);
	};

	const recordsProvider = new RecordsWebviewProvider(context.extensionUri, {
		listRecords: async () => {
			const records = await collectRecords(recordsState);
			recordsDiagnostics.lastState = {
				recordCount: records.length,
				...(recordsState.domainFilter === undefined ? {} : { domainFilter: recordsState.domainFilter }),
				...(recordsState.tagFilter === undefined ? {} : { tagFilter: recordsState.tagFilter }),
			};
			return records;
		},
		listFilterOptions: () => collectRecordFilterOptions(),
		getDomainFilter: () => recordsState.domainFilter,
		getTagFilter: () => recordsState.tagFilter,
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

			if (message.kind === 'setTagFilter') {
				recordsState.tagFilter = normalizeFilterValue(message.tagFilter);
				await recordsProvider.refresh();
				return;
			}

			if (message.kind === 'filterByTag') {
				await runFilterByTag(recordsState, recordsProvider);
				return;
			}

			if (message.kind === 'clearTagFilter') {
				recordsState.tagFilter = undefined;
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

			if (message.kind === 'retire') {
				await retireCandidate(message.id, message.filePath, welcomeProvider, candidatesProvider, recordsProvider, rejectedRecordsProvider, retiredRecordsProvider, message.retiredBy);
			}
		},
	});

	context.subscriptions.push(vscode.window.registerWebviewViewProvider('sundial.welcome', welcomeProvider));
	context.subscriptions.push(vscode.window.registerWebviewViewProvider('sundial.records', recordsProvider));
	context.subscriptions.push(vscode.window.registerWebviewViewProvider('sundial.records.rejected', rejectedRecordsProvider));
	context.subscriptions.push(vscode.window.registerWebviewViewProvider('sundial.records.retired', retiredRecordsProvider));
	context.subscriptions.push(vscode.window.registerWebviewViewProvider('sundial.candidates', candidatesProvider));

	context.subscriptions.push(vscode.commands.registerCommand('sundial.installCli', () => installCli(welcomeProvider)));
	context.subscriptions.push(vscode.commands.registerCommand('sundial.bootstrap', () => bootstrap(candidatesProvider)));
	context.subscriptions.push(vscode.commands.registerCommand('sundial.records.filterByDomain', () => runFilterByDomain(recordsState, recordsProvider)));
	context.subscriptions.push(vscode.commands.registerCommand('sundial.records.filterByTag', () => runFilterByTag(recordsState, recordsProvider)));
	context.subscriptions.push(vscode.commands.registerCommand('sundial.records.clearTagFilter', async () => {
		clearRecordFilters(recordsState);
		await recordsProvider.refresh();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('sundial.records.openPreview', (id?: string) => previewRecord(id)));
	context.subscriptions.push(vscode.commands.registerCommand('sundial.records.editSource', (id?: string) => editRecordSource(id)));
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
	context.subscriptions.push(vscode.commands.registerCommand('sundial.showDiagnostics', async () => {
		const diagnostics = await buildDiagnostics(
			context.extensionUri,
			context.extensionMode,
			recordsDiagnostics,
			rejectedRecordsDiagnostics,
			retiredRecordsDiagnostics,
			candidatesDiagnostics,
			welcomeDiagnostics,
			recordsState,
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
				candidatesDiagnostics,
				welcomeDiagnostics,
				recordsState,
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
			(action: 'accept' | 'reject', id: string, reason?: string) => {
				if (action === 'accept') {
					return acceptCandidate(id, undefined, welcomeProvider, candidatesProvider, recordsProvider, rejectedRecordsProvider, retiredRecordsProvider);
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
			(filter: 'domain' | 'tag', value?: string) => recordsProvider.selectFilterForDiagnostics(filter, value),
		));
	}
	context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
		void candidatesProvider.refresh();
		void recordsProvider.refresh();
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
		getTagFilter: () => undefined,
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
	candidatesDiagnostics: CandidatesDiagnostics,
	welcomeDiagnostics: WelcomeDiagnostics,
	recordsState: RecordsState,
): Promise<ExtensionDiagnostics> {
	const stores = await collectWorkspaceStores();
	const records = await collectRecords(recordsState);
	const rejectedRecords = await collectRecords(undefined, 'rejected');
	const retiredRecords = await collectRecords(undefined, 'retired');
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
		candidatesLastState: candidatesDiagnostics.lastState,
		candidatesLastRendered: candidatesDiagnostics.lastRendered,
		welcomeLastRendered: welcomeDiagnostics.lastRendered,
		welcomeLastCommand: welcomeDiagnostics.lastCommand,
		assets: await Promise.all([
			'dist/webviews/welcome.js',
			'dist/webviews/records.js',
			'dist/webviews/candidates.js',
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
				tags: [...record.tags],
				enabled: record.enabled,
				...(stores.length > 1 ? { workspace: store.name } : {}),
			} satisfies RecordSummary));
	}));

	return all.flat();
}

async function collectRecordFilterOptions(): Promise<{ domains: readonly string[]; tags: readonly string[] }> {
	const stores = await collectWorkspaceStores();
	const all = await Promise.all(stores.map(async store => {
		const [knownDomains, knownTags, records] = await Promise.all([
			listKnownDomains(store.root),
			listKnownTags(store.root),
			listDecisionRecordSummaries(store.root, 'accepted'),
		]);

		return {
			domains: [...knownDomains, ...records.map(record => record.domain)],
			tags: [...knownTags, ...records.flatMap(record => record.tags)],
		};
	}));

	return {
		domains: sortedUnique(all.flatMap(item => item.domains)).filter(domain => domain !== 'all'),
		tags: sortedUnique(all.flatMap(item => item.tags)),
	};
}

function recordMatchesFilters(record: DecisionRecordSummary, filters: Partial<RecordsState> | undefined): boolean {
	return recordMatchesDomain(record.domain, filters?.domainFilter)
		&& recordMatchesTag(record.tags, filters?.tagFilter);
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

function recordMatchesTag(recordTags: readonly string[], tagFilter: string | undefined): boolean {
	if (tagFilter === undefined || recordTags.length === 0) {
		return true;
	}

	return recordTags.includes(tagFilter);
}

function sortedUnique(values: readonly string[]): readonly string[] {
	return [...new Set(values.filter(value => value.length > 0))]
		.sort((left, right) => left.localeCompare(right));
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

async function previewRecord(id: string | undefined, status: DecisionRecordSummaryStatus = 'accepted'): Promise<void> {
	const record = await recordForCommand(id, status);
	await openMarkdownPreview(await resolveRecordPath(record, status));
}

async function editRecordSource(id: string | undefined, status: DecisionRecordSummaryStatus = 'accepted'): Promise<void> {
	const record = await recordForCommand(id, status);
	await openMarkdownSource(await resolveRecordPath(record, status));
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
): Promise<void> {
	await candidatesProvider.refresh();
	await recordsProvider.refresh();
	await rejectedRecordsProvider.refresh();
	await retiredRecordsProvider.refresh();
	await refreshWorkspaceState(welcomeProvider);
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

	scheduleWorkspaceRefresh(welcomeProvider, candidatesProvider, recordsProvider, rejectedRecordsProvider, retiredRecordsProvider);
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
	rejectedRecordsProvider: RecordsWebviewProvider,
	retiredRecordsProvider: RecordsWebviewProvider,
): void {
	for (const delay of [1500, 5000]) {
		setTimeout(() => {
			void candidatesProvider.refresh();
			void recordsProvider.refresh();
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

function showCommandError(error: unknown): void {
	const message = error instanceof Error ? error.message : String(error);
	void vscode.window.showErrorMessage(`Sundial command failed: ${message}`);
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

async function runFilterByTag(state: RecordsState, recordsProvider: RecordsWebviewProvider): Promise<void> {
	const root = await chooseWorkspaceRoot('initialized');
	if (root === undefined) {
		return;
	}

	const records = await listDecisionRecordSummaries(root, 'accepted');
	const knownTags = await listKnownTags(root);
	const tags = sortedUnique([...knownTags, ...records.flatMap(record => record.tags)]);
	const picked = await vscode.window.showQuickPick(tags, {
		placeHolder: 'Filter Decision Records by tag',
	});

	if (picked !== undefined) {
		state.tagFilter = normalizeFilterValue(picked);
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
	state.tagFilter = undefined;
}

function shellQuote(value: string): string {
	return `'${value.replaceAll('\'', '\'\\\'\'')}'`;
}
