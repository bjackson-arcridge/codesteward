import * as assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, test } from 'node:test';
import { discoverCodeStewardRoot, listCandidateSummaries, listDecisionRecordSummaries, listKnownDomains, listKnownTags } from '../candidateInbox';

describe('listCandidateSummaries', () => {
	test('returns empty list when the candidate folder does not exist', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codesteward-vscode-empty-'));

		assert.deepEqual(await listCandidateSummaries(root), []);
	});

	test('reads candidate title, id, and path', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codesteward-vscode-candidates-'));
		const directory = path.join(root, '.codesteward', 'drs', 'candidates');
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

	test('reads accepted decision records and known tags', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codesteward-vscode-records-'));
		const accepted = path.join(root, '.codesteward', 'drs', 'accepted');
		await fs.mkdir(accepted, { recursive: true });
		await fs.writeFile(path.join(root, '.codesteward', 'tags.md'), [
			'# CodeSteward Vocabulary',
			'',
			'## Domains',
			'',
			'### all',
			'Global guidance.',
			'',
			'### vscode.webview',
			'Webview work.',
			'',
			'## Tags',
			'',
			'### architecture',
			'Project-level architecture.',
			'',
			'### testing',
			'Test strategy.',
			'',
		].join('\n'), 'utf8');
		await fs.writeFile(path.join(accepted, 'DR-0001-test.md'), [
			'---',
			'id: DR-0001',
			'title: Test decision',
			'status: accepted',
			'enabled: false',
			'domain: vscode.webview',
			'tags:',
			'  - architecture',
			'  - testing',
			'---',
			'',
		].join('\n'), 'utf8');

		const [record] = await listDecisionRecordSummaries(root);

		assert.equal(record?.id, 'DR-0001');
		assert.equal(record?.title, 'Test decision');
		assert.equal(record?.domain, 'vscode.webview');
		assert.equal(record?.enabled, false);
		assert.deepEqual(record?.tags, ['architecture', 'testing']);
		assert.deepEqual(await listKnownTags(root), ['architecture', 'testing']);
		assert.deepEqual(await listKnownDomains(root), ['all', 'vscode.webview']);
	});

	test('discovers accepted records from a nested workspace folder', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codesteward-vscode-nested-'));
		const nested = path.join(root, 'packages', 'vscode');
		const accepted = path.join(root, '.codesteward', 'drs', 'accepted');
		await fs.mkdir(nested, { recursive: true });
		await fs.mkdir(accepted, { recursive: true });
		await fs.writeFile(path.join(root, '.codesteward', 'tags.md'), [
			'# Tags',
			'',
			'## vscode',
			'VS Code extension work.',
			'',
		].join('\n'), 'utf8');
		await fs.writeFile(path.join(accepted, 'DR-0002-nested.md'), [
			'---',
			'id: DR-0002',
			'title: Nested workspace decision',
			'status: accepted',
			'tags:',
			'  - vscode',
			'---',
			'',
		].join('\n'), 'utf8');

		const [record] = await listDecisionRecordSummaries(nested);

		assert.equal(await discoverCodeStewardRoot(nested), root);
		assert.equal(record?.id, 'DR-0002');
		assert.equal(record?.domain, 'all');
		assert.equal(record?.enabled, true);
		assert.deepEqual(record?.tags, ['vscode']);
		assert.deepEqual(await listKnownTags(nested), ['vscode']);
	});
});
