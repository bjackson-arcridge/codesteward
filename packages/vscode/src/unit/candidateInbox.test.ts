import * as assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, test } from 'node:test';
import {
	discoverSundialRoot,
	listCandidateSummaries,
	listDecisionRecordSummaries,
	listKnownDomains,
	listResearchSummaries,
	listSidebarSpecSummaries,
	listSpecLanes,
	listSpecSummaries,
} from '../candidateInbox';

describe('listCandidateSummaries', () => {
	test('returns empty list when the candidate folder does not exist', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sundial-vscode-empty-'));

		assert.deepEqual(await listCandidateSummaries(root), []);
	});

	test('reads candidate title, id, and path', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sundial-vscode-candidates-'));
		const directory = path.join(root, 'sundial', 'decisions', 'candidates');
		await fs.mkdir(directory, { recursive: true });
		await fs.writeFile(path.join(directory, 'CAND-0001-test.md'), [
			'---',
			'id: CAND-0001',
			'title: Test candidate',
			'status: candidate',
			'---',
			'',
		].join('\n'), 'utf8');

		const [candidate] = await listCandidateSummaries(root);

		assert.equal(candidate?.id, 'CAND-0001');
		assert.equal(candidate?.title, 'Test candidate');
		assert.equal(candidate?.filePath.endsWith('CAND-0001-test.md'), true);
	});

	test('reads accepted decision records and known domains', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sundial-vscode-records-'));
		const accepted = path.join(root, 'sundial', 'decisions', 'accepted');
		await fs.mkdir(accepted, { recursive: true });
		await fs.writeFile(path.join(root, 'sundial', 'domains.md'), [
			'# Sundial Domains',
			'',
			'## Domains',
			'',
			'### all',
			'Global guidance.',
			'',
			'### vscode.webview',
			'Webview work.',
			'',
		].join('\n'), 'utf8');
		await fs.writeFile(path.join(accepted, 'DR-0001-test.md'), [
			'---',
			'id: DR-0001',
			'title: Test decision',
			'status: accepted',
			'enabled: false',
			'domain: vscode.webview',
			'---',
			'',
		].join('\n'), 'utf8');

		const [record] = await listDecisionRecordSummaries(root);

		assert.equal(record?.id, 'DR-0001');
		assert.equal(record?.title, 'Test decision');
		assert.equal(record?.domain, 'vscode.webview');
		assert.equal(record?.enabled, false);
		assert.deepEqual(await listKnownDomains(root), ['all', 'vscode.webview']);
	});

	test('discovers accepted records from a nested workspace folder', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sundial-vscode-nested-'));
		const nested = path.join(root, 'packages', 'vscode');
		const accepted = path.join(root, 'sundial', 'decisions', 'accepted');
		await fs.mkdir(nested, { recursive: true });
		await fs.mkdir(accepted, { recursive: true });
		await fs.writeFile(path.join(root, 'sundial', 'domains.md'), [
			'# Sundial Domains',
			'',
			'## Domains',
			'',
			'### vscode',
			'VS Code extension work.',
			'',
		].join('\n'), 'utf8');
		await fs.writeFile(path.join(accepted, 'DR-0002-nested.md'), [
			'---',
			'id: DR-0002',
			'title: Nested workspace decision',
			'status: accepted',
			'---',
			'',
		].join('\n'), 'utf8');

		const [record] = await listDecisionRecordSummaries(nested);

		assert.equal(await discoverSundialRoot(nested), root);
		assert.equal(record?.id, 'DR-0002');
		assert.equal(record?.domain, 'all');
		assert.equal(record?.enabled, true);
		assert.deepEqual(await listKnownDomains(nested), ['vscode']);
	});

	test('reads research summaries without loading body content into list fields', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sundial-vscode-research-'));
		const research = path.join(root, 'sundial', 'research');
		await fs.mkdir(research, { recursive: true });
		await fs.writeFile(path.join(research, 'RES-0001-api-signatures.md'), [
			'---',
			'id: RES-0001',
			'title: API signatures',
			'domain: vscode.webview',
			'summary: Use before changing the webview provider constructor and message router signatures.',
			'created: 2026-07-07',
			'---',
			'',
			'## Research',
			'',
			'Long details stay in the Markdown file until preview or edit opens it.',
		].join('\n'), 'utf8');

		const [record] = await listResearchSummaries(root);

		assert.equal(record?.id, 'RES-0001');
		assert.equal(record?.title, 'API signatures');
		assert.equal(record?.domain, 'vscode.webview');
		assert.equal(record?.summary, 'Use before changing the webview provider constructor and message router signatures.');
		assert.equal(record?.filePath.endsWith('RES-0001-api-signatures.md'), true);
	});

	test('reads specs from individual markdown files', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sundial-vscode-specs-'));
		const specs = path.join(root, 'sundial', 'specs');
		await fs.mkdir(specs, { recursive: true });
		await fs.writeFile(path.join(specs, 'board.md'), '# Sundial Specs\n\n## Planning\n', 'utf8');
		await fs.writeFile(path.join(specs, 'workflow.yml'), [
			'statuses:',
			'  - name: Backlog',
			'    kanban:',
			'      visible: true',
			'    sidebar:',
			'      visible: true',
			'  - name: Implementation',
			'    kanban:',
			'      visible: true',
			'    sidebar:',
			'      visible: true',
			'  - name: Done',
			'    kanban:',
			'      visible: true',
			'    sidebar:',
			'      visible: true',
			'  - name: Archive',
			'    kanban:',
			'      visible: false',
			'    sidebar:',
			'      visible: false',
			'',
		].join('\n'), 'utf8');
		await fs.writeFile(path.join(specs, 'SPEC-0001-alpha.md'), [
			'---',
			'id: SPEC-0001',
			'title: Alpha spec',
			'status: Implementation',
			'---',
			'',
			'## Discovery',
			'',
		].join('\n'), 'utf8');
		await fs.writeFile(path.join(specs, 'SPEC-0002-archived.md'), [
			'---',
			'id: SPEC-0002',
			'title: Archived spec',
			'status: Archive',
			'---',
			'',
			'## Discovery',
			'',
		].join('\n'), 'utf8');

		const records = await listSpecSummaries(root);
		const sidebarRecords = await listSidebarSpecSummaries(root);

		assert.deepEqual(records.map(record => record.title), ['Alpha spec', 'Archived spec']);
		assert.deepEqual(sidebarRecords.map(record => record.title), ['Alpha spec']);
		assert.equal(records[0]?.id, 'SPEC-0001');
		assert.equal(records[0]?.status, 'Implementation');
		assert.equal(records[0]?.filePath.endsWith('SPEC-0001-alpha.md'), true);
		assert.deepEqual(await listSpecLanes(root), ['Backlog', 'Implementation', 'Done']);
	});
});
