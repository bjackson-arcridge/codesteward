import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
	buildClaudeSpecSessionUri,
	buildCodexSpecSessionArguments,
	buildProviderSpecSessionPrompt,
	buildSpecSessionPrompt,
	findSpecSectionLine,
} from '../specSessions';

const spec = {
	id: 'SPEC-0004',
	title: 'Helper functions to launch sessions',
	filePath: '/repo/sundial/specs/SPEC-0004-helper-functions.md',
};

describe('spec session prompts', () => {
	test('builds one-line phase prompts with spec metadata', () => {
		assert.equal(
			buildSpecSessionPrompt('planning', spec),
			'Use the Sundial decision-aware-design skill/instructions to plan SPEC-0004 "Helper functions to launch sessions" at /repo/sundial/specs/SPEC-0004-helper-functions.md.',
		);
		assert.equal(
			buildSpecSessionPrompt('implementation', spec),
			'Use the Sundial decision-aware-implement skill/instructions to implement SPEC-0004 "Helper functions to launch sessions" at /repo/sundial/specs/SPEC-0004-helper-functions.md.',
		);
		assert.equal(
			buildSpecSessionPrompt('review', spec),
			'Use the Sundial decision-aware-review skill/instructions to review SPEC-0004 "Helper functions to launch sessions" at /repo/sundial/specs/SPEC-0004-helper-functions.md.',
		);
	});

	test('adds Codex slash commands only for planning and review', () => {
		assert.match(buildProviderSpecSessionPrompt('codex', 'planning', spec), /^\/plan Planning only\. Use the Sundial/);
		assert.match(buildProviderSpecSessionPrompt('codex', 'review', spec), /^\/review Review only\. Use the Sundial/);
		assert.doesNotMatch(buildProviderSpecSessionPrompt('codex', 'implementation', spec), /^\//);
		assert.doesNotMatch(buildProviderSpecSessionPrompt('claude', 'planning', spec), /^\//);
	});

	test('keeps the Codex planning prompt out of implementation wording', () => {
		const prompt = buildProviderSpecSessionPrompt('codex', 'planning', spec);

		assert.match(prompt, /Planning only/);
		assert.match(prompt, /to plan SPEC-0004/);
		assert.doesNotMatch(prompt, /to implement SPEC-0004/);
	});

	test('builds Claude URI with an encoded prefill prompt', () => {
		const uri = buildClaudeSpecSessionUri('review', spec);
		const parsed = new URL(uri);

		assert.equal(parsed.protocol, 'vscode:');
		assert.equal(parsed.hostname, 'anthropic.claude-code');
		assert.equal(parsed.pathname, '/open');
		assert.equal(
			parsed.searchParams.get('prompt'),
			buildProviderSpecSessionPrompt('claude', 'review', spec),
		);
	});
});

describe('spec session Codex handoff', () => {
	const markdown = [
		'---',
		'id: SPEC-0004',
		'---',
		'',
		'## Planned Approach',
		'',
		'## Implementation Log',
		'',
		'## Test Log',
		'',
	].join('\n');

	test('uses encoded file name, section line, and generated implementation comment', () => {
		const args = buildCodexSpecSessionArguments('implementation', spec, markdown);

		assert.equal(args.fileName, encodeURIComponent(spec.filePath));
		assert.equal(args.line, 7);
		assert.equal(args.comment, buildProviderSpecSessionPrompt('codex', 'implementation', spec));
	});

	test('maps phases to the most relevant spec sections', () => {
		assert.equal(findSpecSectionLine(markdown, 'planning'), 5);
		assert.equal(findSpecSectionLine(markdown, 'implementation'), 7);
		assert.equal(findSpecSectionLine(markdown, 'review'), 9);
		assert.equal(findSpecSectionLine('# No sections here\n', 'review'), 1);
	});
});
