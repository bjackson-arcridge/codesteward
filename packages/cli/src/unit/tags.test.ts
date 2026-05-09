import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parseTagVocabulary } from '../core/tags';

describe('parseTagVocabulary', () => {
	test('reads structured domain and tag headings with descriptions', () => {
		const vocabulary = parseTagVocabulary([
			'# CodeSteward Vocabulary',
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
			'## Tags',
			'',
			'### application-services',
			'',
			'Application service boundaries.',
			'',
			'### transactions',
			'',
			'Transaction ownership.',
			'',
		].join('\n'));

		assert.deepEqual(vocabulary.errors, []);
		assert.deepEqual(vocabulary.domains.map(domain => domain.name), ['all', 'vscode.webview']);
		assert.equal(vocabulary.domains[1]?.description, 'VS Code webview work.');
		assert.deepEqual(vocabulary.tags.map(tag => tag.name), ['application-services', 'transactions']);
		assert.equal(vocabulary.tags[0].description, 'Application service boundaries.');
	});

	test('reports invalid and duplicate structured vocabulary names', () => {
		const vocabulary = parseTagVocabulary([
			'# CodeSteward Vocabulary',
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
			'## Tags',
			'',
			'### Bad Tag',
			'',
			'Uppercase and spaces are invalid.',
			'',
			'### api',
			'',
			'API choices.',
			'',
			'### api',
			'',
			'Duplicate.',
			'',
		].join('\n'));

		assert.deepEqual(vocabulary.errors, [
			'Invalid domain "Bad Domain" at line 5; use "all" or lowercase dot-separated kebab-case.',
			'Invalid tag "Bad Tag" at line 19; use lowercase kebab-case.',
			'Duplicate domain "cli" at line 13.',
			'Duplicate tag "api" at line 27.',
		]);
	});

	test('continues to read legacy tag-only vocabulary files', () => {
		const vocabulary = parseTagVocabulary([
			'# CodeSteward Tags',
			'',
			'## architecture',
			'',
			'Architecture choices.',
			'',
		].join('\n'));

		assert.deepEqual(vocabulary.errors, []);
		assert.deepEqual(vocabulary.domains, []);
		assert.deepEqual(vocabulary.tags.map(tag => tag.name), ['architecture']);
	});
});
