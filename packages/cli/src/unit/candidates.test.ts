import * as assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, test } from 'node:test';
import {
	acceptCandidate,
	createCandidate,
	rejectCandidate,
	retireCandidate,
} from '../core/candidates';
import { getRecordDomain, getRecordId, getRecordSection, getRecordStatus, getRecordTags, listDecisionRecords } from '../core/dr';
import { initStore } from '../core/store';
import { parseTagVocabulary } from '../core/tags';

const vocabulary = parseTagVocabulary([
	'# CodeSteward Vocabulary',
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
	'## Tags',
	'',
	'### architecture',
	'',
	'Architecture choices.',
	'',
	'### validation',
	'',
	'Validation choices.',
	'',
].join('\n'));

describe('candidate lifecycle', () => {
	test('creates candidates with known tags and proposed tags', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codesteward-candidate-create-'));
		const init = await initStore(root);

		const result = await createCandidate(init.paths, vocabulary, {
			title: 'Validation error response shape',
			domain: 'cli.validation',
			decision: 'Return field-keyed validation errors.',
			affectedFiles: ['src/api/orders.ts'],
			tags: ['validation', 'field-keyed-errors'],
			references: ['src/api/errors.ts#formatValidationErrors'],
			author: 'codex',
			created: '2026-05-03',
		});

		assert.equal(getRecordId(result.record), 'CAND-0001');
		assert.deepEqual(result.knownTags, ['validation']);
		assert.deepEqual(result.proposedTags, ['field-keyed-errors']);
		assert.deepEqual(result.proposedDomains, []);
		assert.equal(result.record.frontmatter.kind, undefined);
			assert.equal(getRecordDomain(result.record), 'cli.validation');
			assert.equal(getRecordSection(result.record, 'Rationale'), undefined);
			assert.equal(getRecordSection(result.record, 'Appendix'), undefined);
		});

	test('accepts DR candidates as accepted DRs and removes the candidate file', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codesteward-candidate-accept-'));
		const init = await initStore(root);
		const created = await createCandidate(init.paths, vocabulary, {
			title: 'Validation error response shape',
			domain: 'cli.validation',
			decision: 'Return field-keyed validation errors.',
			affectedFiles: [],
			tags: ['validation'],
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
		assert.deepEqual(getRecordTags(accepted.record), ['validation']);
		assert.equal(accepted.record.frontmatter.kind, undefined);
		assert.equal(candidates.length, 0);
		assert.deepEqual(acceptedRecords.map(getRecordId), ['DR-0001']);
	});

	test('accepts legacy DR candidates that still include kind metadata', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codesteward-candidate-legacy-kind-'));
		const init = await initStore(root);
		const created = await createCandidate(init.paths, vocabulary, {
			title: 'Legacy kind candidate',
			domain: 'cli',
			decision: 'Accept legacy DR candidates.',
			affectedFiles: [],
			tags: ['architecture'],
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

	test('creates no-tag candidates as tag wildcards for their domain', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codesteward-candidate-no-tags-'));
		const init = await initStore(root);

		const result = await createCandidate(init.paths, vocabulary, {
			title: 'CLI-wide candidate',
			domain: 'cli',
			decision: 'Apply this across CLI work.',
			affectedFiles: [],
			tags: [],
			references: [],
			author: 'codex',
			created: '2026-05-03',
		});

		assert.deepEqual(getRecordTags(result.record), []);
		assert.deepEqual(result.knownTags, []);
		assert.deepEqual(result.proposedTags, []);
		assert.deepEqual(result.proposedDomains, []);
		assert.equal(getRecordDomain(result.record), 'cli');
	});

	test('accepts proposed tags and domains into the vocabulary', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codesteward-candidate-vocabulary-'));
		const init = await initStore(root);
		await fs.writeFile(init.paths.tags, [
			'# CodeSteward Vocabulary',
			'',
			'## Domains',
			'',
			'### all',
			'',
			'Global guidance.',
			'',
			'## Tags',
			'',
			'### validation',
			'',
			'Validation choices.',
			'',
		].join('\n'), 'utf8');
		const initialVocabulary = parseTagVocabulary(await fs.readFile(init.paths.tags, 'utf8'));
		const created = await createCandidate(init.paths, initialVocabulary, {
			title: 'Field keyed API validation',
			domain: 'api.validation',
			proposedDomainDescription: 'API validation behavior.',
			decision: 'Return field-keyed validation errors.',
			affectedFiles: [],
			tags: ['validation', 'field-keyed-errors'],
			proposedTagDescriptions: {
				'field-keyed-errors': 'Validation errors keyed by request field.',
			},
			references: [],
			author: 'codex',
			created: '2026-05-03',
		});

		assert.deepEqual(created.proposedDomains, ['api.validation']);
		assert.deepEqual(created.proposedTags, ['field-keyed-errors']);

		const accepted = await acceptCandidate(init.paths, initialVocabulary, getRecordId(created.record), '2026-05-04');
		const updatedVocabulary = parseTagVocabulary(await fs.readFile(init.paths.tags, 'utf8'));

		assert.equal(getRecordDomain(accepted.record), 'api.validation');
		assert.deepEqual(getRecordTags(accepted.record), ['validation', 'field-keyed-errors']);
		assert.equal(updatedVocabulary.domains.find(domain => domain.name === 'api.validation')?.description, 'API validation behavior.');
		assert.equal(updatedVocabulary.tags.find(tag => tag.name === 'field-keyed-errors')?.description, 'Validation errors keyed by request field.');
	});

	test('rejects and retires candidates into lifecycle folders', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codesteward-candidate-move-'));
		const init = await initStore(root);
		const rejected = await createCandidate(init.paths, vocabulary, {
			title: 'Temporary decision',
			domain: 'all',
			decision: 'Try the temporary path.',
			affectedFiles: [],
			tags: ['architecture'],
			references: [],
			author: 'codex',
			created: '2026-05-03',
		});
		const retired = await createCandidate(init.paths, vocabulary, {
			title: 'Covered decision',
			domain: 'all',
			decision: 'Use the covered path.',
			affectedFiles: [],
			tags: ['architecture'],
			references: [],
			author: 'codex',
			created: '2026-05-03',
		});
		const retiredWithoutReplacement = await createCandidate(init.paths, vocabulary, {
			title: 'Deprecated decision',
			domain: 'all',
			decision: 'Use no longer relevant path.',
			affectedFiles: [],
			tags: ['architecture'],
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
});
