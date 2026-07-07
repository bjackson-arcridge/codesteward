import * as assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, test } from 'node:test';
import {
	getRecordDomain,
	getRecordEnabled,
	getRecordId,
	getRecordReferences,
	getRecordSection,
	listDecisionRecords,
	parseDecisionRecord,
	validateDecisionRecord,
} from '../core/dr';
import { initStore } from '../core/store';
import { parseDomainVocabulary } from '../core/domains';

const acceptedDr = [
	'---',
	'id: DR-0001',
	'title: Repository transaction boundaries',
	'status: accepted',
	'domain: cli',
	'created: 2026-05-03',
	'updated: 2026-05-03',
	'author: codex',
	'references:',
	'  - src/application/orders/CreateOrderService.ts#CreateOrderService',
	'---',
	'',
	'## Applies When',
	'',
	'- The task changes write workflows.',
	'',
	'## Decision',
	'',
	'Repositories do not open or commit transactions.',
	'',
].join('\n');

describe('decision record parsing and validation', () => {
	test('parses frontmatter lists and markdown sections', () => {
	const record = parseDecisionRecord(acceptedDr, '/repo/sundial/decisions/accepted/DR-0001-repository-transaction-boundaries.md', 'accepted');

		assert.equal(getRecordId(record), 'DR-0001');
		assert.equal(getRecordDomain(record), 'cli');
		assert.deepEqual(getRecordReferences(record), ['src/application/orders/CreateOrderService.ts#CreateOrderService']);
		assert.equal(getRecordSection(record, 'Decision'), 'Repositories do not open or commit transactions.');
	});

	test('validates accepted DRs against required fields and status folder', () => {
		const vocabulary = parseDomainVocabulary([
			'# Sundial Domains',
			'',
			'## Domains',
			'',
			'### cli',
			'',
			'CLI.',
			'',
		].join('\n'));
		const record = parseDecisionRecord(acceptedDr, '/repo/sundial/decisions/accepted/DR-0001-repository-transaction-boundaries.md', 'accepted');

		const result = validateDecisionRecord(record, vocabulary);

		assert.deepEqual(result.errors, []);
		assert.deepEqual(result.warnings, []);
	});

	test('reports missing accepted decision section as an error', () => {
		const record = parseDecisionRecord([
			'---',
			'id: DR-0002',
			'title: Missing decision',
			'status: accepted',
			'domain: cli',
			'created: 2026-05-03',
			'updated: 2026-05-03',
			'author: codex',
			'---',
			'',
		].join('\n'), '/repo/sundial/decisions/accepted/DR-0002-missing-decision.md', 'accepted');

		const result = validateDecisionRecord(record, parseDomainVocabulary([
			'## Domains',
			'',
			'### cli',
			'',
			'CLI.',
			'',
		].join('\n')));

		assert.deepEqual(result.errors, [
			'Missing required "## Decision" or "## Pitfalls" section.',
		]);
	});

	test('accepts a pitfalls-only DR without a decision section', () => {
		const vocabulary = parseDomainVocabulary([
			'## Domains',
			'',
			'### cli',
			'',
			'CLI.',
			'',
		].join('\n'));
		const record = parseDecisionRecord([
			'---',
			'id: DR-0010',
			'title: Pitfalls only',
			'status: accepted',
			'domain: cli',
			'created: 2026-05-03',
			'updated: 2026-05-03',
			'author: codex',
			'---',
			'',
			'## Pitfalls',
			'',
			'- Reusing a single HTTP client across tenants leaks auth headers.',
			'- Caching response bodies before the streaming layer breaks chunked encoding.',
			'',
		].join('\n'), '/repo/sundial/decisions/accepted/DR-0010-pitfalls-only.md', 'accepted');

		const result = validateDecisionRecord(record, vocabulary);

		assert.deepEqual(result.errors, []);
		assert.equal(
			getRecordSection(record, 'Pitfalls'),
			'- Reusing a single HTTP client across tenants leaks auth headers.\n- Caching response bodies before the streaming layer breaks chunked encoding.',
		);
	});

	test('defaults missing domain to all and rejects legacy dimension', () => {
		const record = parseDecisionRecord([
			'---',
			'id: DR-0003',
			'title: Legacy dimension',
			'status: accepted',
			'dimension: architecture',
			'created: 2026-05-03',
			'updated: 2026-05-03',
			'author: codex',
			'---',
			'',
			'## Decision',
			'',
			'Use domain.',
			'',
		].join('\n'), '/repo/sundial/decisions/accepted/DR-0003-legacy-dimension.md', 'accepted');

		const result = validateDecisionRecord(record, parseDomainVocabulary(''));

		assert.equal(getRecordDomain(record), 'all');
		assert.deepEqual(result.errors, ['Field "dimension" is no longer supported; use "domain".']);
	});

	test('rejects removed summary and guidance frontmatter fields', () => {
		const record = parseDecisionRecord([
			'---',
			'id: DR-0005',
			'title: Removed fields',
			'status: accepted',
			'created: 2026-05-03',
			'updated: 2026-05-03',
			'author: codex',
			'summary: Use the title instead.',
			'guidance: Use the decision section instead.',
			'---',
			'',
			'## Decision',
			'',
			'Use sections for staged detail.',
			'',
		].join('\n'), '/repo/sundial/decisions/accepted/DR-0005-removed-fields.md', 'accepted');

		const result = validateDecisionRecord(record, parseDomainVocabulary(''));

		assert.deepEqual(result.errors, [
			'Field "summary" is no longer supported; short detail uses "title".',
			'Field "guidance" is no longer supported; medium detail uses "## Decision".',
		]);
	});

	test('validates optional enabled flags', () => {
		const disabled = parseDecisionRecord(acceptedDr.replace(
			'status: accepted\n',
			'status: accepted\nenabled: false\n',
		), '/repo/sundial/decisions/accepted/DR-0001-repository-transaction-boundaries.md', 'accepted');
		const invalid = parseDecisionRecord(acceptedDr.replace(
			'status: accepted\n',
			'status: accepted\nenabled: no\n',
		), '/repo/sundial/decisions/accepted/DR-0001-repository-transaction-boundaries.md', 'accepted');
		const vocabulary = parseDomainVocabulary([
			'## Domains',
			'',
			'### cli',
			'',
			'CLI.',
			'',
		].join('\n'));

		assert.equal(getRecordEnabled(disabled), false);
		assert.deepEqual(validateDecisionRecord(disabled, vocabulary).errors, []);
		assert.deepEqual(validateDecisionRecord(invalid, vocabulary).errors, ['Field "enabled" must be true or false.']);
	});

	test('lists records from lifecycle folders in deterministic id order', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sundial-decisions-'));
		const init = await initStore(root);
		const firstPath = path.join(init.paths.store, 'decisions', 'accepted', 'DR-0002-second.md');
		const secondPath = path.join(init.paths.store, 'decisions', 'accepted', 'DR-0001-first.md');

		await fs.writeFile(firstPath, acceptedDr.replaceAll('DR-0001', 'DR-0002'), 'utf8');
		await fs.writeFile(secondPath, acceptedDr, 'utf8');

		const records = await listDecisionRecords(init.paths, 'accepted');

		assert.deepEqual(records.map(getRecordId), ['DR-0001', 'DR-0002']);
	});
});
