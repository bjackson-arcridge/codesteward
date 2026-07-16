import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { commandLineDeletionRange, createPromptContext, parsePromptCommand, promptPresets } from '../promptCommand';

describe('prompt command parser', () => {
	test('accepts every preset with optional global scope', () => {
		for (const preset of promptPresets) {
			assert.deepEqual(parsePromptCommand(preset), { preset, scope: 'line' });
			assert.deepEqual(parsePromptCommand(`${preset} @G`), { preset, scope: 'project' });
		}

		assert.deepEqual(parsePromptCommand('%1:F @G\t '), { preset: '%1:F', scope: 'project' });
	});

	test('rejects source text, unrecognised presets, and malformed modifiers', () => {
		for (const sourceLine of [
			'',
			' :Q',
			'const answer = "%Q";',
			':Q',
			'>1:F',
			'%3:F',
			'%1:F@G',
			'%1:F @g',
			'%1:F @G trailing',
			'%Q @G @G',
			'% 1:F',
			' \t%1:F',
		]) {
			assert.equal(parsePromptCommand(sourceLine), undefined, sourceLine);
		}
	});
});

describe('command line deletion ranges', () => {
	test('removes the line ending for first and middle lines', () => {
		assert.deepEqual(commandLineDeletionRange(0, 3, 2), {
			start: { line: 0, character: 0 },
			end: { line: 1, character: 0 },
		});
		assert.deepEqual(commandLineDeletionRange(1, 3, 5), {
			start: { line: 1, character: 0 },
			end: { line: 2, character: 0 },
		});
	});

	test('does not extend past the last source line', () => {
		assert.deepEqual(commandLineDeletionRange(2, 3, 4), {
			start: { line: 2, character: 0 },
			end: { line: 2, character: 4 },
		});
	});

	test('rejects invalid document coordinates', () => {
		assert.throws(() => commandLineDeletionRange(-1, 3, 2), RangeError);
		assert.throws(() => commandLineDeletionRange(3, 3, 2), RangeError);
		assert.throws(() => commandLineDeletionRange(0, 3, -1), RangeError);
	});
});

test('creates prompt context without changing the original source text', () => {
	const parsed = parsePromptCommand('%2:C @G');
	if (parsed === undefined) {
		throw new Error('Expected the preset to parse.');
	}

	const context = createPromptContext(parsed, 'file:///workspace/src/example.ts', 8, '%2:C @G');
	assert.deepEqual(context, {
		preset: '%2:C',
		scope: 'project',
		sourceUri: 'file:///workspace/src/example.ts',
		sourceLine: 8,
		sourceText: '%2:C @G',
	});
});
