import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, test } from 'node:test';
import { isHostToWebview, isWebviewToHost, parseDomainsCliJson } from '../webviews/domains/messages';

describe('domains message protocol', () => {
	const state = {
		kind: 'state',
		workspaces: [{ root: '/project', name: 'project' }],
		selectedWorkspace: '/project',
		domains: [{ name: 'all', description: 'Global.', referenceCount: 0 }],
		suggestions: [{ name: 'api', description: 'API.' }],
		busy: false,
	} as const;

	test('accepts typed states and mutations', () => {
		assert.equal(isHostToWebview(state), true);
		assert.equal(isWebviewToHost({ kind: 'add', name: 'api', description: 'API.' }), true);
		assert.equal(isWebviewToHost({ kind: 'update', currentName: 'api', description: 'Updated.' }), true);
		assert.equal(isWebviewToHost({ kind: 'remove', name: 'api' }), true);
		assert.equal(isWebviewToHost({ kind: 'selectWorkspace', root: '/project' }), true);
		assert.equal(parseDomainsCliJson({ version: 1, domains: state.domains, suggestions: state.suggestions }).version, 1);
	});

	test('rejects malformed messages and CLI contracts', () => {
		assert.equal(isHostToWebview({ ...state, busy: 'false' }), false);
		assert.equal(isWebviewToHost({ kind: 'update', currentName: 'api' }), false);
		assert.equal(isWebviewToHost({ kind: 'remove', name: 1 }), false);
		assert.throws(() => parseDomainsCliJson({ version: 2, domains: [], suggestions: [] }));
	});
});

describe('domains app', () => {
	test('provides semantic inline CRUD, suggestions, keyboard cancellation, and diagnostics', () => {
		const source = fs.readFileSync(
			path.resolve(__dirname, '../../src/webviews/apps/domains/domains-app.ts'),
			'utf8',
		);
		assert.match(source, /<ul aria-label="Domains">/);
		assert.match(source, /aria-label="Add domain"/);
		assert.match(source, /Suggested domains|aria-label="Suggested domains"/);
		assert.match(source, /event\.key === 'Escape'/);
		assert.match(source, /referenceCount/);
		assert.match(source, /selectedWorkspace/);
		assert.match(source, /formVisible/);
	});
});
