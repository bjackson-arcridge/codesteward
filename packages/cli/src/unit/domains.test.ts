import * as assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, test } from 'node:test';
import {
	addDomain,
	parseDomainVocabulary,
	readDomainsJson,
	removeDomain,
	renderDomainSection,
	updateDomain,
} from '../core/domains';
import { initStore } from '../core/store';

describe('parseDomainVocabulary', () => {
	test('reads structured domain headings with descriptions', () => {
		const vocabulary = parseDomainVocabulary([
			'# Sundial Domains',
			'',
			'## Domains',
			'',
			'### all',
			'',
			'Global guidance.',
			'',
			'### vscode.webview',
			'',
			'VS Code webview work.',
			'',
		].join('\n'));

		assert.deepEqual(vocabulary.errors, []);
		assert.deepEqual(vocabulary.domains.map(domain => domain.name), ['all', 'vscode.webview']);
		assert.equal(vocabulary.domains[1]?.description, 'VS Code webview work.');
	});

	test('reports invalid and duplicate domain names', () => {
		const vocabulary = parseDomainVocabulary([
			'# Sundial Domains',
			'',
			'## Domains',
			'',
			'### Bad Domain',
			'',
			'Uppercase and spaces are invalid.',
			'',
			'### cli',
			'',
			'CLI.',
			'',
			'### cli',
			'',
			'Duplicate.',
			'',
		].join('\n'));

		assert.deepEqual(vocabulary.errors, [
			'Invalid domain "Bad Domain" at line 5; use "all" or lowercase dot-separated kebab-case.',
			'Duplicate domain "cli" at line 13.',
		]);
	});

	test('ignores other sections', () => {
		const vocabulary = parseDomainVocabulary([
			'# Sundial Domains',
			'',
			'## Domains',
			'',
			'### cli',
			'',
			'CLI.',
			'',
			'## Notes',
			'',
			'### ignored',
			'',
			'Should not appear as a domain.',
			'',
		].join('\n'));

		assert.deepEqual(vocabulary.errors, []);
		assert.deepEqual(vocabulary.domains.map(domain => domain.name), ['cli']);
	});

	test('sorts reads and canonical writes while preserving surrounding sections', () => {
		const source = [
			'# Vocabulary',
			'',
			'Preamble.',
			'',
			'## Domains',
			'',
			'### ui',
			'',
			'UI.',
			'',
			'### all',
			'',
			'Global.',
			'',
			'## Notes',
			'',
			'Keep me.',
			'',
		].join('\n');
		assert.deepEqual(parseDomainVocabulary(source).domains.map(domain => domain.name), ['all', 'ui']);
		const rendered = renderDomainSection(source, parseDomainVocabulary(source).domains);
		assert.ok(rendered.indexOf('### all') < rendered.indexOf('### ui'));
		assert.match(rendered, /Preamble\./);
		assert.match(rendered, /## Notes\n\nKeep me\./);
	});

	test('adds, updates, removes, filters suggestions, and blocks exact references', async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sundial-domain-mutations-'));
		const init = await initStore(root);
		await addDomain(init.paths.domains, 'api', 'API contracts.');
		await addDomain(init.paths.domains, 'ui.accessibility', 'Accessible UI.');
		await updateDomain(init.paths.domains, 'ui.accessibility', { description: 'UI accessibility.' });
		const json = await readDomainsJson(init.paths.domains);
		assert.equal(json.version, 1);
		assert.equal(json.suggestions.some(suggestion => suggestion.name === 'api'), false);
		assert.deepEqual(json.domains.map(domain => domain.name), [...json.domains.map(domain => domain.name)].sort());

		const reference = path.join(init.paths.store, 'research', 'REF-0001-api.md');
		await fs.writeFile(reference, ['---', 'id: REF-0001', 'domain: api', '---', ''].join('\n'), 'utf8');
		await assert.rejects(() => updateDomain(init.paths.domains, 'api', { name: 'api-contracts' }), /research\/REF-0001-api\.md/);
		await assert.rejects(() => removeDomain(init.paths.domains, 'api'), /Cannot remove domain "api"/);
		await removeDomain(init.paths.domains, 'ui.accessibility');
		await assert.rejects(() => removeDomain(init.paths.domains, 'all'), /cannot be removed/);
		await updateDomain(init.paths.domains, 'all', { description: 'Updated global guidance.' });
	});
});
