import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { isHostToWebview as isWelcomeHost, isWebviewToHost as isWelcomeClient } from '../webviews/welcome/messages';
import { isHostToWebview as isCandidatesHost, isWebviewToHost as isCandidatesClient } from '../webviews/candidates/messages';
import { isHostToWebview as isRecordsHost, isWebviewToHost as isRecordsClient } from '../webviews/records/messages';
import { isHostToWebview as isSpecsHost, isWebviewToHost as isSpecsClient } from '../webviews/specs/messages';

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
	test('accept host state with empty candidates', () => {
		assert.equal(isCandidatesHost({ kind: 'state', candidates: [] }), true);
		assert.equal(isCandidatesHost({
			kind: 'state',
			candidates: [],
			diagnosticsEnabled: true,
		}), true);
	});

	test('accept host state with candidate entries', () => {
		assert.equal(isCandidatesHost({
			kind: 'state',
			candidates: [{ id: 'CAND-1', title: 'Foo', filePath: '/repo/sundial/decisions/candidates/CAND-1.md' }],
		}), true);
		assert.equal(isCandidatesHost({
			kind: 'state',
			candidates: [{ id: 'CAND-1', title: 'Foo' }],
		}), true);
	});

	test('accept diagnostics-only host click request', () => {
		assert.equal(isCandidatesHost({ kind: 'diagnosticClickCandidate', id: 'CAND-1', target: 'title' }), true);
		assert.equal(isCandidatesHost({ kind: 'diagnosticClickCandidate', id: 'CAND-1', target: 'preview' }), false);
		assert.equal(isCandidatesHost({ kind: 'diagnosticClickCandidate', id: 'CAND-1', target: 'edit' }), false);
	});

	test('reject malformed host state', () => {
		assert.equal(isCandidatesHost({
			kind: 'state',
			candidates: [{ id: 'CAND-1', title: 'Foo', filePath: 42 }],
		}), false);
		assert.equal(isCandidatesHost({
			kind: 'state',
			candidates: [],
			diagnosticsEnabled: 'true',
		}), false);
		assert.equal(isCandidatesHost({ kind: 'diagnosticSelectProvider', provider: 'claude' }), false);
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
		assert.equal(isCandidatesClient({
			kind: 'rendered',
			diagnostic: {
				candidateCount: 1,
				cardCount: 1,
				emptyVisible: false,
			},
		}), true);
	});

	test('reject id-bearing commands missing id', () => {
		assert.equal(isCandidatesClient({ kind: 'accept' }), false);
		assert.equal(isCandidatesClient({ kind: 'reject', id: 'CAND-1' }), false);
		assert.equal(isCandidatesClient({ kind: 'retire', id: 'CAND-1' }), false);
		assert.equal(isCandidatesClient({ kind: 'open', id: 42 }), false);
		assert.equal(isCandidatesClient({ kind: 'bootstrap', provider: 'claude' }), false);
		assert.equal(isCandidatesClient({
			kind: 'rendered',
			diagnostic: {
				candidateCount: '1',
				cardCount: 1,
				emptyVisible: false,
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
			records: [{
				id: 'SPEC-0001',
				title: 'Alpha spec',
				domain: 'all',
				enabled: true,
				status: 'Active',
				worktree: {
					kind: 'associatedActive',
					worktreePath: '/repo/.sundial-worktrees/SPEC-0001-alpha',
					primaryPath: '/repo',
					branch: 'SPEC-0001-alpha',
				},
			}],
			specGroups: [{
				status: 'Active',
				collapsed: false,
				records: [{
					id: 'SPEC-0001',
					title: 'Alpha spec',
					domain: 'all',
					enabled: true,
					status: 'Active',
					worktree: { kind: 'none' },
				}],
			}],
			specStatusOptions: ['Backlog', 'Active'],
			workspaces: ['repo'],
			actionMode: 'specs',
		}), true);
		assert.equal(isRecordsHost({ kind: 'diagnosticClickRecord', id: 'SPEC-0001', target: 'delete', workspace: 'repo' }), true);
		assert.equal(isRecordsHost({ kind: 'diagnosticClickRecord', id: 'SPEC-0001', target: 'finishWorktree', workspace: 'repo' }), true);
		assert.equal(isRecordsHost({ kind: 'diagnosticClickRecord', id: 'SPEC-0001', target: 'planning', workspace: 'repo' }), true);
		assert.equal(isRecordsHost({ kind: 'diagnosticClickRecord', id: 'SPEC-0001', target: 'implementation', workspace: 'repo' }), true);
		assert.equal(isRecordsHost({ kind: 'diagnosticClickRecord', id: 'SPEC-0001', target: 'review', workspace: 'repo' }), true);
		assert.equal(isRecordsHost({ kind: 'diagnosticCreateSpec', title: 'New spec' }), true);
		assert.equal(isRecordsHost({ kind: 'diagnosticCreateSpec', title: 'New spec', status: 'Backlog', workspace: 'repo' }), true);
		assert.equal(isRecordsHost({ kind: 'diagnosticMoveSpec', id: 'SPEC-0001', status: 'Archive', workspace: 'repo' }), true);
		assert.equal(isRecordsHost({ kind: 'diagnosticDeleteSpec', id: 'SPEC-0001', workspace: 'repo', skipConfirmation: true }), true);
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
			records: [{ id: 'SPEC-0001', title: 'Spec', domain: 'all', enabled: true, worktree: { kind: 'associatedActive' } }],
			actionMode: 'specs',
		}), false);
		assert.equal(isRecordsHost({
			kind: 'state',
			records: [{ id: 'SPEC-0001', title: 'Spec', domain: 'all', enabled: true, worktree: { kind: 'error', message: 5 } }],
			actionMode: 'specs',
		}), false);
		assert.equal(isRecordsHost({
			kind: 'state',
			records: [],
			actionMode: 'archived',
		}), false);
		assert.equal(isRecordsHost({ kind: 'diagnosticClickRecord', id: 'SPEC-0001', target: 'edit' }), false);
		assert.equal(isRecordsHost({ kind: 'diagnosticCreateSpec', status: 'Backlog' }), false);
		assert.equal(isRecordsHost({ kind: 'diagnosticMoveSpec', id: 'SPEC-0001' }), false);
		assert.equal(isRecordsHost({ kind: 'diagnosticDeleteSpec', id: 'SPEC-0001', skipConfirmation: 'yes' }), false);
		assert.equal(isRecordsHost({
			kind: 'state',
			records: [],
			specGroups: [{ status: 'Active', records: [{ id: 'SPEC-0001', title: 'Missing metadata' }] }],
			actionMode: 'specs',
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
		assert.equal(isRecordsClient({ kind: 'openBoard' }), true);
		assert.equal(isRecordsClient({ kind: 'createSpec', title: 'New spec', status: 'Backlog', workspace: 'repo' }), true);
		assert.equal(isRecordsClient({ kind: 'moveSpec', id: 'SPEC-0001', status: 'Archive', workspace: 'repo' }), true);
		assert.equal(isRecordsClient({ kind: 'specWorktreeAction', action: 'createWorktree', id: 'SPEC-0001', workspace: 'repo' }), true);
		assert.equal(isRecordsClient({ kind: 'specWorktreeAction', action: 'finishWorktree', id: 'SPEC-0001', workspace: 'repo' }), true);
		assert.equal(isRecordsClient({ kind: 'deleteSpec', id: 'SPEC-0001', workspace: 'repo', skipConfirmation: true }), true);
		assert.equal(isRecordsClient({ kind: 'launchSpec', id: 'SPEC-0001', phase: 'implementation', workspace: 'repo' }), true);
		assert.equal(isRecordsClient({ kind: 'toggleSpecGroup', status: 'Active', collapsed: true }), true);
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
				groupCount: 3,
				openBoardButtonVisible: true,
				specAddFormVisible: true,
				specWorktreeActionCount: 1,
				specDeleteActionCount: 1,
			},
		}), true);
	});

	test('reject malformed render diagnostics', () => {
		assert.equal(isRecordsClient({ kind: 'rendered' }), false);
		assert.equal(isRecordsClient({ kind: 'setDomainFilter', domainFilter: 5 }), false);
		assert.equal(isRecordsClient({ kind: 'toggleEnabled', id: 'DR-1', enabled: 'false' }), false);
		assert.equal(isRecordsClient({ kind: 'retire', id: 'DR-1' }), false);
		assert.equal(isRecordsClient({ kind: 'toggleSpecGroup', status: 'Active' }), false);
		assert.equal(isRecordsClient({ kind: 'createSpec', title: 'New spec' }), false);
		assert.equal(isRecordsClient({ kind: 'moveSpec', id: 'SPEC-0001' }), false);
		assert.equal(isRecordsClient({ kind: 'specWorktreeAction', action: 'finishWorktree' }), false);
		assert.equal(isRecordsClient({ kind: 'specWorktreeAction', action: 'finish' , id: 'SPEC-0001' }), false);
		assert.equal(isRecordsClient({ kind: 'deleteSpec', id: 'SPEC-0001', skipConfirmation: 'yes' }), false);
		assert.equal(isRecordsClient({ kind: 'launchSpec', id: 'SPEC-0001', phase: 'audit' }), false);
		assert.equal(isRecordsClient({
			kind: 'rendered',
			diagnostic: { recordCount: 1, cardCount: '1', emptyVisible: false },
		}), false);
	});
});

describe('specs board message guards', () => {
	test('accept host state and diagnostics messages', () => {
		assert.equal(isSpecsHost({
			kind: 'state',
			lanes: ['Backlog', 'Active'],
			specs: [{ id: 'SPEC-0001', title: 'Board MVP', status: 'Active', worktree: { kind: 'none' } }],
		}), true);
		assert.equal(isSpecsHost({
			kind: 'state',
			lanes: ['Backlog'],
			specs: [{
				id: 'SPEC-0001',
				title: 'Board MVP',
				status: 'Backlog',
				workspace: 'repo',
				worktree: {
					kind: 'associatedElsewhere',
					worktreePath: '/repo/.sundial-worktrees/SPEC-0001-board',
					primaryPath: '/repo',
					branch: 'SPEC-0001-board',
					canFinish: true,
				},
			}],
			workspaces: ['repo'],
			diagnosticsEnabled: true,
		}), true);
		assert.equal(isSpecsHost({ kind: 'diagnosticClickSpec', id: 'SPEC-0001', target: 'open' }), true);
		assert.equal(isSpecsHost({ kind: 'diagnosticClickSpec', id: 'SPEC-0001', target: 'openWorktree' }), true);
		assert.equal(isSpecsHost({ kind: 'diagnosticClickSpec', id: 'SPEC-0001', target: 'archive' }), true);
		assert.equal(isSpecsHost({ kind: 'diagnosticClickSpec', id: 'SPEC-0001', target: 'review' }), true);
		assert.equal(isSpecsHost({ kind: 'diagnosticClickSpec', id: 'SPEC-0001', target: 'delete', workspace: 'repo' }), true);
		assert.equal(isSpecsHost({ kind: 'diagnosticCreateSpec', title: 'New spec', status: 'Backlog' }), true);
		assert.equal(isSpecsHost({ kind: 'diagnosticMoveSpec', id: 'SPEC-0001', status: 'Active' }), true);
		assert.equal(isSpecsHost({ kind: 'diagnosticDeleteSpec', id: 'SPEC-0001' }), true);
	});

	test('reject malformed host messages', () => {
		assert.equal(isSpecsHost({ kind: 'state', lanes: 'Backlog', specs: [] }), false);
		assert.equal(isSpecsHost({ kind: 'state', lanes: ['Backlog'], specs: [{ id: 'SPEC-1', title: 'Missing status', worktree: { kind: 'none' } }] }), false);
		assert.equal(isSpecsHost({ kind: 'state', lanes: ['Backlog'], specs: [{ id: 'SPEC-1', title: 'Bad state', status: 'Backlog', worktree: { kind: 'active' } }] }), false);
		assert.equal(isSpecsHost({ kind: 'state', lanes: ['Backlog'], specs: [{ id: 'SPEC-1', title: 'Missing state', status: 'Backlog' }] }), false);
		assert.equal(isSpecsHost({ kind: 'diagnosticClickSpec', id: 'SPEC-0001', target: 'edit' }), false);
		assert.equal(isSpecsHost({ kind: 'diagnosticCreateSpec', title: 'New spec' }), false);
		assert.equal(isSpecsHost({ kind: 'diagnosticMoveSpec', id: 'SPEC-0001' }), false);
	});

	test('accept all defined client commands', () => {
		assert.equal(isSpecsClient({ kind: 'open', id: 'SPEC-0001' }), true);
		assert.equal(isSpecsClient({ kind: 'worktreeAction', action: 'returnPrimary', id: 'SPEC-0001', workspace: 'repo' }), true);
		assert.equal(isSpecsClient({ kind: 'create', title: 'New spec', status: 'Backlog' }), true);
		assert.equal(isSpecsClient({ kind: 'move', id: 'SPEC-0001', status: 'Active', workspace: 'repo' }), true);
		assert.equal(isSpecsClient({ kind: 'delete', id: 'SPEC-0001' }), true);
		assert.equal(isSpecsClient({ kind: 'launch', id: 'SPEC-0001', phase: 'planning', workspace: 'repo' }), true);
		assert.equal(isSpecsClient({ kind: 'requestRefresh' }), true);
		assert.equal(isSpecsClient({
			kind: 'rendered',
			diagnostic: {
				laneCount: 4,
				specCount: 1,
				cardCount: 1,
				emptyVisible: false,
				worktreeActionCount: 1,
			},
		}), true);
	});

	test('reject malformed client commands', () => {
		assert.equal(isSpecsClient({ kind: 'open' }), false);
		assert.equal(isSpecsClient({ kind: 'worktreeAction', action: 'returnPrimary' }), false);
		assert.equal(isSpecsClient({ kind: 'worktreeAction', action: 'return', id: 'SPEC-0001' }), false);
		assert.equal(isSpecsClient({ kind: 'create', title: 'New spec' }), false);
		assert.equal(isSpecsClient({ kind: 'move', id: 'SPEC-0001' }), false);
		assert.equal(isSpecsClient({ kind: 'delete', id: 12 }), false);
		assert.equal(isSpecsClient({ kind: 'launch', id: 'SPEC-0001', phase: 'retrospective' }), false);
		assert.equal(isSpecsClient({
			kind: 'rendered',
			diagnostic: {
				laneCount: '4',
				specCount: 1,
				cardCount: 1,
				emptyVisible: false,
			},
		}), false);
	});
});
