import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { isHostToWebview, isWebviewToHost } from '../webviews/messages/messages';

const prompt = {
	preset: '%1:W',
	scope: 'project',
	sourceUri: 'file:///workspace/src/example.ts',
	sourceLine: 3,
	sourceText: '%1:W @G',
} as const;

const draft = '[Integration stub] Sundial received %1:W for project scope.';

describe('messages protocol guards', () => {
	test('accepts every defined host message', () => {
		assert.equal(isHostToWebview({ kind: 'state' }), true);
		assert.equal(isHostToWebview({ kind: 'state', prompt, draft }), true);
		assert.equal(isHostToWebview({ kind: 'focusComposer' }), true);
		assert.equal(isHostToWebview({ kind: 'clearPrompt' }), true);
		assert.equal(isHostToWebview({ kind: 'submissionAcknowledged' }), true);
	});

	test('rejects malformed host messages', () => {
		assert.equal(isHostToWebview({ kind: 'state', prompt, draft: 12 }), false);
		assert.equal(isHostToWebview({ kind: 'state', prompt }), false);
		assert.equal(isHostToWebview({ kind: 'state', draft }), false);
		assert.equal(isHostToWebview({ kind: 'state', prompt: { ...prompt, scope: 'global' }, draft }), false);
		assert.equal(isHostToWebview({ kind: 'state', prompt: { ...prompt, sourceLine: -1 }, draft }), false);
		assert.equal(isHostToWebview({ kind: 'state', prompt: { ...prompt, preset: '%4:X' }, draft }), false);
		assert.equal(isHostToWebview({ kind: 'other' }), false);
		assert.equal(isHostToWebview(null), false);
	});

	test('accepts and rejects the webview commands by their full shape', () => {
		assert.equal(isWebviewToHost({ kind: 'submit', message: '' }), true);
		assert.equal(isWebviewToHost({ kind: 'submit', message: 'Please fix this.' }), true);
		assert.equal(isWebviewToHost({ kind: 'cancel' }), true);
		assert.equal(isWebviewToHost({ kind: 'submit' }), false);
		assert.equal(isWebviewToHost({ kind: 'submit', message: 12 }), false);
		assert.equal(isWebviewToHost({ kind: 'cancel', message: 'unexpected' }), true);
		assert.equal(isWebviewToHost({ kind: 'send', message: 'nope' }), false);
	});
});
