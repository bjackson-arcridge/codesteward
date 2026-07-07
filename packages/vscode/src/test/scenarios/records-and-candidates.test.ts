import * as assert from 'assert';
import * as path from 'node:path';
import * as vscode from 'vscode';

import {
	activateExtension,
	focusRecordsView,
	focusRetiredRecordsView,
	type ExtensionDiagnostics,
	useLocalSundialCli,
	waitForActiveMarkdownPreview,
	waitForHistoricalRecordWebviewDiagnostics,
	waitForWebviewDiagnostics,
	wait,
} from './shared/helpers';

const expectedAcceptedRecordCount = 3;
const expectedRejectedRecordCount = 1;
const expectedRetiredRecordCount = 1;
const expectedActiveCandidateCount = 2;

suite('Scenario: records-and-candidates', () => {
	test('webviews render the seeded fixture state', async () => {
		await activateExtension();

		const diagnostics = await waitForWebviewDiagnostics();
		assert.equal(
			diagnostics.acceptedRecordCount,
			expectedAcceptedRecordCount,
			`Expected ${expectedAcceptedRecordCount} accepted records: ${JSON.stringify(diagnostics)}`,
		);
		assert.equal(
			diagnostics.activeCandidateCount,
			expectedActiveCandidateCount,
			`Expected ${expectedActiveCandidateCount} active candidates: ${JSON.stringify(diagnostics)}`,
		);
		assert.equal(
			diagnostics.rejectedRecordCount,
			expectedRejectedRecordCount,
			`Expected ${expectedRejectedRecordCount} rejected records: ${JSON.stringify(diagnostics)}`,
		);
		assert.equal(
			diagnostics.retiredRecordCount,
			expectedRetiredRecordCount,
			`Expected ${expectedRetiredRecordCount} retired records: ${JSON.stringify(diagnostics)}`,
		);
		assert.equal(getSidebarViewVisibility('sundial.records.rejected'), 'collapsed');
		assert.equal(getSidebarViewVisibility('sundial.records.retired'), 'collapsed');
		assert.equal(diagnostics.recordsLastRendered?.recordCount, diagnostics.recordsLastState?.recordCount);
		assert.equal(diagnostics.recordsLastRendered?.cardCount, diagnostics.recordsLastState?.recordCount);
		assert.equal(diagnostics.recordsLastRendered?.emptyVisible, false);
		assert.equal(diagnostics.candidatesLastRendered?.candidateCount, diagnostics.candidatesLastState?.candidateCount);
		assert.equal(diagnostics.candidatesLastRendered?.cardCount, diagnostics.candidatesLastState?.candidateCount);
		assert.equal(diagnostics.candidatesLastRendered?.emptyVisible, false);

		const historicalDiagnostics = await waitForHistoricalRecordWebviewDiagnostics();
		assert.equal(historicalDiagnostics.rejectedRecordsLastRendered?.recordCount, expectedRejectedRecordCount);
		assert.equal(historicalDiagnostics.rejectedRecordsLastRendered?.cardCount, expectedRejectedRecordCount);
		assert.equal(historicalDiagnostics.rejectedRecordsLastRendered?.emptyVisible, false);
		assert.equal(historicalDiagnostics.retiredRecordsLastRendered?.recordCount, expectedRetiredRecordCount);
		assert.equal(historicalDiagnostics.retiredRecordsLastRendered?.cardCount, expectedRetiredRecordCount);
		assert.equal(historicalDiagnostics.retiredRecordsLastRendered?.emptyVisible, false);
	});

	test('records sidebar filter dropdown renders and applies domain filters', async () => {
		await activateExtension();

		const initialDiagnostics = await waitForWebviewDiagnostics();
		assert.equal(initialDiagnostics.recordsLastRendered?.domainSelectOptionCount, 7);

		await vscode.commands.executeCommand('sundial.internal.records.selectFilter', 'domain', 'vscode');
		const domainDiagnostics = await waitForRecordFilterDiagnostics({
			recordCount: 2,
			domainFilter: 'vscode',
		});
		assert.equal(domainDiagnostics.recordsLastRendered?.cardCount, 2);

		await vscode.commands.executeCommand('sundial.internal.records.selectFilter', 'domain');
		await waitForRecordFilterDiagnostics({ recordCount: expectedAcceptedRecordCount });
	});

	test('clicking a candidate title opens rendered markdown preview', async () => {
		await activateExtension();
		await waitForWebviewDiagnostics();

		const candidatePath = getCandidateFixturePath('CAND-0001-fixture-candidate-renders.md');

		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
		await vscode.commands.executeCommand('sundial.internal.candidates.click', 'CAND-0001', 'title');

		await waitForActiveMarkdownPreview(candidatePath);
	});

	test('clicking a candidate preview button opens rendered markdown preview', async () => {
		await activateExtension();
		await waitForWebviewDiagnostics();

		const candidatePath = getCandidateFixturePath('CAND-0001-fixture-candidate-renders.md');

		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
		await vscode.commands.executeCommand('sundial.internal.candidates.click', 'CAND-0001', 'preview');

		await waitForActiveMarkdownPreview(candidatePath);
	});

	test('accepts and rejects candidates through the extension lifecycle', async () => {
		await useLocalSundialCli();
		await activateExtension();
		await waitForWebviewDiagnostics();

		await vscode.commands.executeCommand('sundial.internal.candidates.lifecycle', 'accept', 'CAND-0001');
		await waitForGovernanceCounts({
			acceptedRecordCount: expectedAcceptedRecordCount + 1,
			activeCandidateCount: expectedActiveCandidateCount - 1,
			rejectedRecordCount: expectedRejectedRecordCount,
		});

		await vscode.commands.executeCommand('sundial.internal.candidates.lifecycle', 'reject', 'CAND-0002', 'Rejected by integration coverage.');
		await waitForGovernanceCounts({
			acceptedRecordCount: expectedAcceptedRecordCount + 1,
			activeCandidateCount: 0,
			rejectedRecordCount: expectedRejectedRecordCount + 1,
		});
	});

	test('refreshes lifecycle state after returning to sidebar views', async () => {
		await useLocalSundialCli();
		await activateExtension();
		const before = await waitForWebviewDiagnostics();
		await waitForHistoricalRecordWebviewDiagnostics();
		await focusRecordsView();

		await vscode.commands.executeCommand('sundial.internal.records.lifecycle', 'retire', 'DR-0001', 'DR-0002');
		const expectedAcceptedRecordCount = before.acceptedRecordCount - 1;
		const expectedRetiredRecordCount = before.retiredRecordCount + 1;
		await waitForGovernanceCounts({
			acceptedRecordCount: expectedAcceptedRecordCount,
			activeCandidateCount: before.activeCandidateCount,
			rejectedRecordCount: before.rejectedRecordCount,
			retiredRecordCount: expectedRetiredRecordCount,
		});

		await waitForReturnedRecordsViewCount(expectedAcceptedRecordCount);
		await waitForReturnedRetiredRecordsViewCount(expectedRetiredRecordCount);
	});
});

function getSidebarViewVisibility(id: string): string | undefined {
	const extension = vscode.extensions.getExtension('arcridge.sundial');
	const views = extension?.packageJSON?.contributes?.views?.sundial;
	if (!Array.isArray(views)) {
		throw new Error('Expected Sundial sidebar view contributions');
	}

	const view = views.find(item => typeof item === 'object' && item !== null && item.id === id);
	if (view === undefined) {
		throw new Error(`Expected sidebar view contribution ${id}`);
	}

	return view.visibility;
}

function getCandidateFixturePath(filename: string): string {
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	if (workspaceRoot === undefined) {
		throw new Error('Expected scenario workspace folder to be open');
	}

	return path.join(workspaceRoot, 'sundial', 'decisions', 'candidates', filename);
}

interface ExpectedRecordFilterDiagnostics {
	readonly recordCount: number;
	readonly domainFilter?: string;
}

async function waitForRecordFilterDiagnostics(
	expected: ExpectedRecordFilterDiagnostics,
	timeoutMs = 5000,
): Promise<ExtensionDiagnostics> {
	const started = Date.now();
	let last: ExtensionDiagnostics | undefined;

	while (Date.now() - started < timeoutMs) {
		await focusRecordsView();
		last = await vscode.commands.executeCommand<ExtensionDiagnostics>('sundial.internal.webviewDiagnostics');
		if (
			last.recordsLastState?.recordCount === expected.recordCount
			&& last.recordsLastRendered?.recordCount === expected.recordCount
			&& last.recordsLastRendered?.cardCount === expected.recordCount
			&& last.recordsLastState?.domainFilter === expected.domainFilter
			&& last.recordsLastRendered?.domainFilter === expected.domainFilter
		) {
			return last;
		}

		await wait(100);
	}

	throw new Error(`Timed out waiting for record filter diagnostics: ${JSON.stringify({ expected, last })}`);
}

interface ExpectedGovernanceCounts {
	readonly acceptedRecordCount: number;
	readonly activeCandidateCount: number;
	readonly rejectedRecordCount: number;
	readonly retiredRecordCount?: number;
}

async function waitForGovernanceCounts(
	expected: ExpectedGovernanceCounts,
	timeoutMs = 10000,
): Promise<ExtensionDiagnostics> {
	const started = Date.now();
	let last: ExtensionDiagnostics | undefined;

	while (Date.now() - started < timeoutMs) {
		last = await vscode.commands.executeCommand<ExtensionDiagnostics>('sundial.internal.webviewDiagnostics');
		if (
			last.acceptedRecordCount === expected.acceptedRecordCount
			&& last.activeCandidateCount === expected.activeCandidateCount
			&& last.rejectedRecordCount === expected.rejectedRecordCount
			&& (expected.retiredRecordCount === undefined || last.retiredRecordCount === expected.retiredRecordCount)
		) {
			return last;
		}

		await wait(100);
	}

	throw new Error(`Timed out waiting for governance counts: ${JSON.stringify({ expected, last })}`);
}

async function waitForReturnedRecordsViewCount(expectedRecordCount: number): Promise<ExtensionDiagnostics> {
	return waitForReturnedSidebarRender(
		focusRecordsView,
		diagnostics => diagnostics.recordsLastRendered?.recordCount,
		expectedRecordCount,
		'accepted records',
	);
}

async function waitForReturnedRetiredRecordsViewCount(expectedRecordCount: number): Promise<ExtensionDiagnostics> {
	return waitForReturnedSidebarRender(
		focusRetiredRecordsView,
		diagnostics => diagnostics.retiredRecordsLastRendered?.recordCount,
		expectedRecordCount,
		'retired records',
	);
}

async function waitForReturnedSidebarRender(
	focusView: () => Promise<void>,
	readRenderedCount: (diagnostics: ExtensionDiagnostics) => number | undefined,
	expectedRecordCount: number,
	label: string,
	timeoutMs = 5000,
): Promise<ExtensionDiagnostics> {
	await vscode.commands.executeCommand('workbench.view.explorer');
	await wait(300);
	await focusView();
	await wait(750);

	const started = Date.now();
	let last: ExtensionDiagnostics | undefined;
	while (Date.now() - started < timeoutMs) {
		last = await vscode.commands.executeCommand<ExtensionDiagnostics>('sundial.internal.webviewDiagnostics');
		if (readRenderedCount(last) === expectedRecordCount) {
			return last;
		}

		await wait(100);
	}

	throw new Error(`Timed out waiting for returned ${label} render: ${JSON.stringify({ expectedRecordCount, last })}`);
}
