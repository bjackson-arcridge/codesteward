import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parseDomainVocabulary } from '../core/domains';

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
});
