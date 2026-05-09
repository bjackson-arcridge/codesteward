import * as assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, test } from 'node:test';
import { validateStore, validationErrorCount } from '../core/validation';
import { initStore } from '../core/store';

describe('validateStore', () => {
	test('includes validation failures in the validation result', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codesteward-validation-'));
		const init = await initStore(root);
		await fs.writeFile(path.join(init.paths.store, 'drs', 'accepted', 'DR-0001-invalid.md'), [
			'---',
			'id: DR-0001',
			'title: Invalid',
			'status: accepted',
			'domain: cli',
			'created: 2026-05-03',
			'updated: 2026-05-03',
			'author: codex',
			'tags:',
			'  - missing-tag',
			'---',
			'',
		].join('\n'), 'utf8');

		const result = await validateStore(init.paths);

		assert.equal(validationErrorCount(result), 2);
	});

	test('warns about broken local reference pointers', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codesteward-validation-references-'));
		const init = await initStore(root);
		await fs.writeFile(path.join(init.paths.store, 'drs', 'accepted', 'DR-0001-reference.md'), [
			'---',
			'id: DR-0001',
			'title: Reference',
			'status: accepted',
			'domain: cli',
			'created: 2026-05-03',
			'updated: 2026-05-03',
			'author: codex',
			'tags:',
			'  - architecture',
			'references:',
			'  - src/missing.ts#Missing',
			'---',
			'',
			'## Decision',
			'',
			'Keep references alive.',
			'',
		].join('\n'), 'utf8');

		const result = await validateStore(init.paths);

		assert.equal(result.validationResults[0]?.warnings.includes('Reference target does not exist: src/missing.ts#Missing'), true);
	});
});
