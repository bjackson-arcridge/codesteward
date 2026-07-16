import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
	completionsForPromptCommandPrefix,
	isPromptCommandMode,
	promptCommandCompletions,
} from '../promptCompletion';

describe('prompt command completions', () => {
	test('offers line and project variants for all six presets', () => {
		assert.equal(promptCommandCompletions.length, 12);
		assert.deepEqual(
			promptCommandCompletions.map(completion => completion.insertText),
			[
				'%Q', '%Q @G',
				'%1:F', '%1:F @G',
				'%1:W', '%1:W @G',
				'%1:R', '%1:R @G',
				'%2:C', '%2:C @G',
				'%0:T', '%0:T @G',
			],
		);
	});

	test('enters command mode only when a viable percent command starts in column zero', () => {
		assert.equal(isPromptCommandMode('%'), true);
		assert.equal(isPromptCommandMode('%1'), true);
		assert.equal(isPromptCommandMode('%1:F @'), true);
		assert.equal(isPromptCommandMode(' %1'), false);
		assert.equal(isPromptCommandMode('const value = %'), false);
		assert.equal(isPromptCommandMode('%unknown'), false);
	});

	test('narrows completions while preserving a project-scope choice', () => {
		assert.deepEqual(
			completionsForPromptCommandPrefix('%1:F').map(completion => completion.insertText),
			['%1:F', '%1:F @G'],
		);
		assert.deepEqual(
			completionsForPromptCommandPrefix('%1:F @').map(completion => completion.insertText),
			['%1:F @G'],
		);
	});
});
