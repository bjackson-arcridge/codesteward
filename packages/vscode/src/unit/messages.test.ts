import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { isHostToWebview as isWelcomeHost, isWebviewToHost as isWelcomeClient } from '../webviews/welcome/messages';
import { isHostToWebview as isCandidatesHost, isWebviewToHost as isCandidatesClient } from '../webviews/candidates/messages';
import { isHostToWebview as isRecordsHost, isWebviewToHost as isRecordsClient } from '../webviews/records/messages';

describe('welcome message guards', () => {
	test('accept well-formed host -> webview state', () => {
		assert.equal(isWelcomeHost({ kind: 'state', state: { cliAvailable: true, cliPath: 'sundial' } }), true);
		assert.equal(isWelcomeHost({
			kind: 'state',
			state: { cliAvailable: true, cliPath: 'sundial' },
			diagnosticsEnabled: true,
		}), true);
	});

	test('reject host -> webview with missing fields', () => {
		assert.equal(isWelcomeHost({ kind: 'state', state: { cliAvailable: true } }), false);
		assert.equal(isWelcomeHost({ kind: 'state' }), false);
		assert.equal(isWelcomeHost({}), false);
		assert.equal(isWelcomeHost(null), false);
		assert.equal(isWelcomeHost({
			kind: 'state',
			state: { cliAvailable: true, cliPath: 'sundial' },
			diagnosticsEnabled: 'yes',
		}), false);
	});

	test('accept diagnostic host -> webview commands', () => {
		assert.equal(isWelcomeHost({ kind: 'diagnosticToggleAgent', agent: 'claude', selected: true }), true);
		assert.equal(isWelcomeHost({ kind: 'diagnosticToggleAgent', agent: 'codex', selected: false }), true);
		assert.equal(isWelcomeHost({ kind: 'diagnosticInit' }), true);
	});

	test('reject malformed diagnostic host -> webview commands', () => {
		assert.equal(isWelcomeHost({ kind: 'diagnosticToggleAgent', agent: 'other', selected: true }), false);
		assert.equal(isWelcomeHost({ kind: 'diagnosticToggleAgent', agent: 'claude', selected: 'yes' }), false);
	});

	test('accept all defined webview -> host commands', () => {
		assert.equal(isWelcomeClient({ kind: 'installCli' }), true);
		assert.equal(isWelcomeClient({ kind: 'init', claude: true, codex: false }), true);
		assert.equal(isWelcomeClient({ kind: 'init', claude: false, codex: true }), true);
		assert.equal(isWelcomeClient({ kind: 'init', claude: true, codex: true }), true);
		assert.equal(isWelcomeClient({ kind: 'requestRefresh' }), true);
		assert.equal(isWelcomeClient({
			kind: 'rendered',
			diagnostic: { cliAvailable: true, claudeSelected: false, codexSelected: false, initDisabled: true },
		}), true);
	});

	test('reject init without an agent selected', () => {
		assert.equal(isWelcomeClient({ kind: 'init', claude: false, codex: false }), false);
		assert.equal(isWelcomeClient({ kind: 'init' }), false);
		assert.equal(isWelcomeClient({ kind: 'init', claude: 'yes', codex: false }), false);
	});

	test('reject malformed render diagnostics', () => {
		assert.equal(isWelcomeClient({ kind: 'rendered' }), false);
		assert.equal(isWelcomeClient({
			kind: 'rendered',
			diagnostic: { cliAvailable: 'yes', claudeSelected: false, codexSelected: false, initDisabled: true },
		}), false);
	});

	test('reject unknown webview -> host commands', () => {
		assert.equal(isWelcomeClient({ kind: 'launch' }), false);
		assert.equal(isWelcomeClient('init'), false);
	});
});

describe('candidates message guards', () => {
	const baseState = { installedProviders: [], hasAcceptedRecords: false };

	test('accept host state with empty candidates', () => {
		assert.equal(isCandidatesHost({ kind: 'state', candidates: [], ...baseState }), true);
		assert.equal(isCandidatesHost({
			kind: 'state',
			candidates: [],
			...baseState,
			diagnosticsEnabled: true,
		}), true);
	});

	test('accept host state with candidate entries and providers', () => {
		assert.equal(isCandidatesHost({
			kind: 'state',
			candidates: [{ id: 'CAND-1', title: 'Foo', filePath: '/repo/sundial/decisions/candidates/CAND-1.md' }],
			installedProviders: ['claude'],
			hasAcceptedRecords: true,
		}), true);
		assert.equal(isCandidatesHost({
			kind: 'state',
			candidates: [{ id: 'CAND-1', title: 'Foo' }],
			installedProviders: ['claude', 'codex'],
			hasAcceptedRecords: false,
		}), true);
	});

	test('accept diagnostics-only host click request', () => {
		assert.equal(isCandidatesHost({ kind: 'diagnosticClickCandidate', id: 'CAND-1', target: 'title' }), true);
		assert.equal(isCandidatesHost({ kind: 'diagnosticClickCandidate', id: 'CAND-1', target: 'preview' }), true);
		assert.equal(isCandidatesHost({ kind: 'diagnosticClickCandidate', id: 'CAND-1', target: 'edit' }), false);
	});

	test('accept diagnostic provider selection', () => {
		assert.equal(isCandidatesHost({ kind: 'diagnosticSelectProvider', provider: 'claude' }), true);
		assert.equal(isCandidatesHost({ kind: 'diagnosticSelectProvider', provider: 'codex' }), true);
		assert.equal(isCandidatesHost({ kind: 'diagnosticSelectProvider', provider: 'gpt' }), false);
		assert.equal(isCandidatesHost({ kind: 'diagnosticSelectProvider' }), false);
	});

	test('reject host state with malformed candidate or provider metadata', () => {
		assert.equal(isCandidatesHost({
			kind: 'state',
			candidates: [{ id: 'CAND-1', title: 'Foo', filePath: 42 }],
			...baseState,
		}), false);
		assert.equal(isCandidatesHost({
			kind: 'state',
			candidates: [],
			...baseState,
			diagnosticsEnabled: 'true',
		}), false);
		assert.equal(isCandidatesHost({
			kind: 'state',
			candidates: [],
			installedProviders: ['gpt'],
			hasAcceptedRecords: false,
		}), false);
		assert.equal(isCandidatesHost({
			kind: 'state',
			candidates: [],
			installedProviders: [],
			hasAcceptedRecords: 'true',
		}), false);
	});

	test('accept all defined client commands', () => {
		assert.equal(isCandidatesClient({ kind: 'preview', id: 'CAND-1', filePath: '/repo/sundial/decisions/candidates/CAND-1.md' }), true);
		assert.equal(isCandidatesClient({ kind: 'edit', id: 'CAND-1', filePath: '/repo/sundial/decisions/candidates/CAND-1.md' }), true);
		assert.equal(isCandidatesClient({ kind: 'open', id: 'CAND-1' }), true);
		assert.equal(isCandidatesClient({ kind: 'accept', id: 'CAND-1' }), true);
		assert.equal(isCandidatesClient({ kind: 'dismiss', id: 'CAND-1', filePath: '/repo/sundial/decisions/candidates/CAND-1.md' }), true);
		assert.equal(isCandidatesClient({ kind: 'reject', id: 'CAND-1', reason: '' }), true);
		assert.equal(isCandidatesClient({ kind: 'reject', id: 'CAND-1', reason: 'Too specific.' }), true);
		assert.equal(isCandidatesClient({ kind: 'retire', id: 'CAND-1', retiredBy: 'DR-1' }), true);
		assert.equal(isCandidatesClient({ kind: 'retire', id: 'CAND-1', retiredBy: '' }), true);
		assert.equal(isCandidatesClient({ kind: 'requestRefresh' }), true);
		assert.equal(isCandidatesClient({ kind: 'bootstrap', provider: 'claude' }), true);
		assert.equal(isCandidatesClient({ kind: 'bootstrap', provider: 'codex' }), true);
		assert.equal(isCandidatesClient({
			kind: 'rendered',
			diagnostic: {
				candidateCount: 1,
				cardCount: 1,
				emptyVisible: false,
				bootstrapAction: 'bootstrap',
				providerSelectorVisible: false,
			},
		}), true);
		assert.equal(isCandidatesClient({
			kind: 'rendered',
			diagnostic: {
				candidateCount: 0,
				cardCount: 0,
				emptyVisible: true,
				bootstrapAction: 'audit',
				bootstrapProvider: 'claude',
				providerSelectorVisible: true,
			},
		}), true);
	});

	test('reject id-bearing commands missing id', () => {
		assert.equal(isCandidatesClient({ kind: 'accept' }), false);
		assert.equal(isCandidatesClient({ kind: 'reject', id: 'CAND-1' }), false);
		assert.equal(isCandidatesClient({ kind: 'retire', id: 'CAND-1' }), false);
		assert.equal(isCandidatesClient({ kind: 'open', id: 42 }), false);
		assert.equal(isCandidatesClient({ kind: 'bootstrap' }), false);
		assert.equal(isCandidatesClient({ kind: 'bootstrap', provider: 'gpt' }), false);
		assert.equal(isCandidatesClient({
			kind: 'rendered',
			diagnostic: {
				candidateCount: '1',
				cardCount: 1,
				emptyVisible: false,
				bootstrapAction: 'bootstrap',
				providerSelectorVisible: false,
			},
		}), false);
		assert.equal(isCandidatesClient({
			kind: 'rendered',
			diagnostic: {
				candidateCount: 1,
				cardCount: 1,
				emptyVisible: false,
				bootstrapAction: 'archived',
				providerSelectorVisible: false,
			},
		}), false);
	});
});

describe('records message guards', () => {
	test('accept host state with optional filter metadata', () => {
		assert.equal(isRecordsHost({ kind: 'state', records: [] }), true);
		assert.equal(isRecordsHost({
			kind: 'state',
			records: [],
			domainFilter: 'vscode',
			domainOptions: ['vscode'],
		}), true);
		assert.equal(isRecordsHost({ kind: 'state', records: [], diagnosticsEnabled: true }), true);
		assert.equal(isRecordsHost({ kind: 'diagnosticSelectFilter', filter: 'domain', value: 'vscode' }), true);
		assert.equal(isRecordsHost({
			kind: 'state',
			records: [{ id: 'DR-1', title: 'Decision', domain: 'vscode.webview', enabled: true }],
			actionMode: 'accepted',
		}), true);
		assert.equal(isRecordsHost({
			kind: 'state',
			records: [{ id: 'RES-1', title: 'Research', domain: 'vscode.webview', enabled: true, summary: 'API details to load before editing.' }],
			actionMode: 'research',
		}), true);
		assert.equal(isRecordsHost({
			kind: 'state',
			records: [{ id: 'SPEC-0001', title: 'Alpha spec', domain: 'all', enabled: true, status: 'Active' }],
			actionMode: 'specs',
		}), true);
	});

	test('reject host state with malformed records metadata', () => {
		assert.equal(isRecordsHost({ kind: 'state', records: [], domainFilter: 5 }), false);
		assert.equal(isRecordsHost({ kind: 'state', records: [], domainOptions: ['vscode', 5] }), false);
		assert.equal(isRecordsHost({ kind: 'state', records: [], diagnosticsEnabled: 'true' }), false);
		assert.equal(isRecordsHost({ kind: 'diagnosticSelectFilter', filter: 'status', value: 'accepted' }), false);
		assert.equal(isRecordsHost({
			kind: 'state',
			records: [{ id: 'DR-1', title: 'Decision' }],
		}), false);
		assert.equal(isRecordsHost({
			kind: 'state',
			records: [{ id: 'DR-1', title: 'Decision', domain: 'vscode.webview' }],
		}), false);
		assert.equal(isRecordsHost({
			kind: 'state',
			records: [{ id: 'DR-1', title: 'Decision', domain: 42, enabled: true }],
		}), false);
		assert.equal(isRecordsHost({
			kind: 'state',
			records: [{ id: 'RES-1', title: 'Research', domain: 'vscode.webview', enabled: true, summary: 42 }],
		}), false);
		assert.equal(isRecordsHost({
			kind: 'state',
			records: [],
			actionMode: 'archived',
		}), false);
	});

	test('accept all defined client commands', () => {
		assert.equal(isRecordsClient({ kind: 'preview', id: 'DR-1' }), true);
		assert.equal(isRecordsClient({ kind: 'edit', id: 'DR-1' }), true);
		assert.equal(isRecordsClient({ kind: 'setDomainFilter', domainFilter: 'vscode' }), true);
		assert.equal(isRecordsClient({ kind: 'toggleEnabled', id: 'DR-1', enabled: false }), true);
		assert.equal(isRecordsClient({ kind: 'retire', id: 'DR-1', retiredBy: 'DR-2' }), true);
		assert.equal(isRecordsClient({ kind: 'retire', id: 'DR-1', retiredBy: '' }), true);
		assert.equal(isRecordsClient({ kind: 'promote', id: 'CAND-1' }), true);
		assert.equal(isRecordsClient({ kind: 'delete', id: 'CAND-1' }), true);
		assert.equal(isRecordsClient({ kind: 'clearFilters' }), true);
		assert.equal(isRecordsClient({ kind: 'requestRefresh' }), true);
		assert.equal(isRecordsClient({
			kind: 'rendered',
			diagnostic: {
				recordCount: 1,
				cardCount: 1,
				emptyVisible: false,
				domainFilter: 'vscode',
				domainSelectOptionCount: 2,
			},
		}), true);
	});

	test('reject malformed render diagnostics', () => {
		assert.equal(isRecordsClient({ kind: 'rendered' }), false);
		assert.equal(isRecordsClient({ kind: 'setDomainFilter', domainFilter: 5 }), false);
		assert.equal(isRecordsClient({ kind: 'toggleEnabled', id: 'DR-1', enabled: 'false' }), false);
		assert.equal(isRecordsClient({ kind: 'retire', id: 'DR-1' }), false);
		assert.equal(isRecordsClient({
			kind: 'rendered',
			diagnostic: { recordCount: 1, cardCount: '1', emptyVisible: false },
		}), false);
	});
});
