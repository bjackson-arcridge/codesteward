import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, test } from 'node:test';
import { isHostToWebview, isWebviewToHost } from '../webviews/main/messages';

describe('main sidebar message protocol', () => {
	test('accepts section-specific state and commands', () => {
		assert.equal(isHostToWebview({
			kind: 'state',
			activeSection: 'records',
			visibleSections: ['records'],
			sectionState: { kind: 'state', records: [] },
		}), true);
		assert.equal(isHostToWebview({
			kind: 'sectionMessage',
			section: 'candidates',
			message: { kind: 'state', candidates: [] },
		}), true);
		assert.equal(isWebviewToHost({ kind: 'selectSection', section: 'specs' }), true);
		assert.equal(isWebviewToHost({ kind: 'setSectionVisibility', section: 'specs', visible: false }), true);
		assert.equal(isWebviewToHost({
			kind: 'sectionMessage',
			section: 'specs',
			message: { kind: 'requestRefresh' },
		}), true);
	});

	test('rejects mismatched and unknown section envelopes', () => {
		assert.equal(isHostToWebview({
			kind: 'state',
			activeSection: 'records',
			visibleSections: ['specs'],
			sectionState: { kind: 'state', candidates: [] },
		}), false);
		assert.equal(isWebviewToHost({ kind: 'selectSection', section: 'unknown' }), false);
		assert.equal(isWebviewToHost({ kind: 'setSectionVisibility', section: 'specs', visible: 'false' }), false);
		assert.equal(isWebviewToHost({
			kind: 'sectionMessage',
			section: 'candidates',
			message: { kind: 'clearFilters' },
		}), false);
	});
});

describe('main sidebar accordion', () => {
	test('renders one maximal-height region with accessible keyboard navigation', () => {
		const source = fs.readFileSync(
			path.resolve(__dirname, '../../src/webviews/apps/main/main-sidebar-app.ts'),
			'utf8',
		);

		assert.match(source, /\.section\.active\s*\{\s*flex: 1;/);
		assert.match(source, /aria-expanded=\$\{active\}/);
		assert.match(source, /active \? html`[\s\S]*role="region"/);
		assert.match(source, /case 'ArrowDown':/);
		assert.match(source, /case 'ArrowUp':/);
		assert.match(source, /case 'Home':/);
		assert.match(source, /case 'End':/);
		assert.match(source, /@contextmenu=\$\{this\.handleHeaderContextMenu\}/);
		assert.match(source, /openAt\(header, event\.clientX, event\.clientY, false\)/);
		assert.match(source, /Hide' : 'Show'/);
		assert.match(source, /visibleSections/);
		const popoverSource = fs.readFileSync(
			path.resolve(__dirname, '../../src/webviews/apps/shared/components/cs-popover.ts'),
			'utf8',
		);
		assert.match(popoverSource, /@mouseleave=\$\{this\.handleSurfaceMouseLeave\}/);
		assert.match(popoverSource, /getBoundingClientRect: \(\) => new DOMRect\(x, y, 0, 0\)/);
	});
});
