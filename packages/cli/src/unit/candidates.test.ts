import * as assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, test } from 'node:test';
import {
	acceptCandidate,
	createCandidate,
	dismissCandidate,
	rejectCandidate,
	retireCandidate,
} from '../core/candidates';
import { getRecordDomain, getRecordId, getRecordSection, getRecordStatus, listDecisionRecords } from '../core/dr';
import { initStore } from '../core/store';
import { parseDomainVocabulary } from '../core/domains';

const vocabulary = parseDomainVocabulary([
	'# Sundial Domains',
	'',
	'## Domains',
	'',
	'### all',
	'',
	'Global guidance.',
	'',
	'### cli',
	'',
	'CLI guidance.',
	'',
	'### cli.validation',
	'',
	'CLI validation guidance.',
	'',
].join('\n'));

describe('candidate lifecycle', () => {
	test('creates candidates with known domain', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sundial-candidate-create-'));
		const init = await initStore(root);

		const result = await createCandidate(init.paths, vocabulary, {
			title: 'Validation error response shape',
			domain: 'cli.validation',
			decision: 'Return field-keyed validation errors.',
			references: ['src/api/orders.ts', 'src/api/errors.ts#formatValidationErrors'],
			author: 'codex',
			created: '2026-05-03',
		});

		assert.equal(getRecordId(result.record), 'CAND-0001');
		assert.deepEqual(result.proposedDomains, []);
		assert.equal(result.record.frontmatter.kind, undefined);
		assert.equal(getRecordDomain(result.record), 'cli.validation');
		assert.equal(getRecordSection(result.record, 'Rationale'), undefined);
		assert.equal(getRecordSection(result.record, 'Appendix'), undefined);
		assert.equal(getRecordSection(result.record, 'Pitfalls'), undefined);
	});

	test('creates candidates with decision and pitfalls together', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sundial-candidate-pitfalls-'));
		const init = await initStore(root);

		const result = await createCandidate(init.paths, vocabulary, {
			title: 'Tenant-scoped HTTP clients',
			domain: 'cli',
			decision: 'Construct a new HTTP client per tenant request.',
			pitfalls: '- Sharing one client across tenants leaks auth headers.\n- Pooling at the agent level defeats per-tenant TLS settings.',
			references: [],
			author: 'codex',
			created: '2026-05-03',
		});

		assert.equal(
			getRecordSection(result.record, 'Decision'),
			'Construct a new HTTP client per tenant request.',
		);
		assert.equal(
			getRecordSection(result.record, 'Pitfalls'),
			'- Sharing one client across tenants leaks auth headers.\n- Pooling at the agent level defeats per-tenant TLS settings.',
		);
	});

	test('creates pitfalls-only candidates when no positive decision applies', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sundial-candidate-pitfalls-only-'));
		const init = await initStore(root);

		const result = await createCandidate(init.paths, vocabulary, {
			title: 'CLI argument parsing traps',
			domain: 'cli',
			pitfalls: '- Consuming the next argv as a value without checking it is also a flag.',
			references: [],
			author: 'codex',
			created: '2026-05-03',
		});

		assert.equal(getRecordSection(result.record, 'Decision'), undefined);
		assert.equal(
			getRecordSection(result.record, 'Pitfalls'),
			'- Consuming the next argv as a value without checking it is also a flag.',
		);
	});

	test('rejects candidates with neither decision nor pitfalls', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sundial-candidate-empty-'));
		const init = await initStore(root);

		await assert.rejects(
			createCandidate(init.paths, vocabulary, {
				title: 'Empty body',
				domain: 'cli',
				references: [],
				author: 'codex',
				created: '2026-05-03',
			}),
			/decision, pitfalls, or both/,
		);
	});

	test('accepts DR candidates as accepted DRs and removes the candidate file', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sundial-candidate-accept-'));
		const init = await initStore(root);
		const created = await createCandidate(init.paths, vocabulary, {
			title: 'Validation error response shape',
			domain: 'cli.validation',
			decision: 'Return field-keyed validation errors.',
			references: [],
			author: 'codex',
			created: '2026-05-03',
		});

		const accepted = await acceptCandidate(init.paths, vocabulary, getRecordId(created.record), '2026-05-04');
		const candidates = await listDecisionRecords(init.paths, 'candidate');
		const acceptedRecords = await listDecisionRecords(init.paths, 'accepted');

		assert.equal(getRecordId(accepted.record), 'DR-0001');
		assert.equal(getRecordStatus(accepted.record), 'accepted');
		assert.equal(getRecordDomain(accepted.record), 'cli.validation');
		assert.equal(accepted.record.frontmatter.kind, undefined);
		assert.equal(candidates.length, 0);
		assert.deepEqual(acceptedRecords.map(getRecordId), ['DR-0001']);
	});

	test('accepts legacy DR candidates that still include kind metadata', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sundial-candidate-legacy-kind-'));
		const init = await initStore(root);
		const created = await createCandidate(init.paths, vocabulary, {
			title: 'Legacy kind candidate',
			domain: 'cli',
			decision: 'Accept legacy DR candidates.',
			references: [],
			author: 'codex',
			created: '2026-05-03',
		});
		const legacyKindFrontmatter = ['kind', 'dr'].join(': ');
		await fs.writeFile(created.record.filePath, created.record.markdown.replace('id: CAND-0001\n', `id: CAND-0001\n${legacyKindFrontmatter}\n`), 'utf8');

		const accepted = await acceptCandidate(init.paths, vocabulary, getRecordId(created.record), '2026-05-04');

		assert.equal(getRecordId(accepted.record), 'DR-0001');
		assert.equal(accepted.record.frontmatter.kind, undefined);
	});

	test('accepts proposed domains into the vocabulary', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sundial-candidate-vocabulary-'));
		const init = await initStore(root);
		await fs.writeFile(init.paths.domains, [
			'# Sundial Domains',
			'',
			'## Domains',
			'',
			'### all',
			'',
			'Global guidance.',
			'',
		].join('\n'), 'utf8');
		const initialVocabulary = parseDomainVocabulary(await fs.readFile(init.paths.domains, 'utf8'));
		const created = await createCandidate(init.paths, initialVocabulary, {
			title: 'Field keyed API validation',
			domain: 'api.validation',
			proposedDomainDescription: 'API validation behavior.',
			decision: 'Return field-keyed validation errors.',
			references: [],
			author: 'codex',
			created: '2026-05-03',
		});

		assert.deepEqual(created.proposedDomains, ['api.validation']);

		const accepted = await acceptCandidate(init.paths, initialVocabulary, getRecordId(created.record), '2026-05-04');
		const updatedVocabulary = parseDomainVocabulary(await fs.readFile(init.paths.domains, 'utf8'));

		assert.equal(getRecordDomain(accepted.record), 'api.validation');
		assert.equal(updatedVocabulary.domains.find(domain => domain.name === 'api.validation')?.description, 'API validation behavior.');
	});

	test('rejects and retires candidates into lifecycle folders', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sundial-candidate-move-'));
		const init = await initStore(root);
		const rejected = await createCandidate(init.paths, vocabulary, {
			title: 'Temporary decision',
			domain: 'all',
			decision: 'Try the temporary path.',
			references: [],
			author: 'codex',
			created: '2026-05-03',
		});
		const retired = await createCandidate(init.paths, vocabulary, {
			title: 'Covered decision',
			domain: 'all',
			decision: 'Use the covered path.',
			references: [],
			author: 'codex',
			created: '2026-05-03',
		});
		const retiredWithoutReplacement = await createCandidate(init.paths, vocabulary, {
			title: 'Deprecated decision',
			domain: 'all',
			decision: 'Use no longer relevant path.',
			references: [],
			author: 'codex',
			created: '2026-05-03',
		});

		await rejectCandidate(init.paths, getRecordId(rejected.record), 'Covered by existing guidance.');
		await retireCandidate(init.paths, getRecordId(retired.record), 'DR-0001');
		await retireCandidate(init.paths, getRecordId(retiredWithoutReplacement.record), undefined);

		const rejectedRecords = await listDecisionRecords(init.paths, 'rejected');
		const retiredRecords = await listDecisionRecords(init.paths, 'retired');

		assert.deepEqual(rejectedRecords.map(getRecordId), ['CAND-0001']);
		assert.deepEqual(retiredRecords.map(getRecordId), ['CAND-0002', 'CAND-0003']);
		assert.equal(retiredRecords[1].frontmatter.retired_by, undefined);
	});

	test('dismisses candidates by deleting without lifecycle history', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sundial-candidate-dismiss-'));
		const init = await initStore(root);
		const created = await createCandidate(init.paths, vocabulary, {
			title: 'Discarded proposal',
			domain: 'all',
			decision: 'Use the discarded path.',
			references: [],
			author: 'codex',
			created: '2026-05-03',
		});

		const dismissed = await dismissCandidate(init.paths, getRecordId(created.record));

		assert.equal(dismissed.id, 'CAND-0001');
		assert.equal(dismissed.title, 'Discarded proposal');
		assert.equal(await fs.access(dismissed.from).then(() => true, () => false), false);
		assert.deepEqual((await listDecisionRecords(init.paths, 'candidate')).map(getRecordId), []);
		assert.deepEqual((await listDecisionRecords(init.paths, 'rejected')).map(getRecordId), []);
		assert.deepEqual((await listDecisionRecords(init.paths, 'retired')).map(getRecordId), []);
	});
});
