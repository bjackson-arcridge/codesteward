import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, test } from 'node:test';

function readSpecsBoardAppSource(): string {
	return fs.readFileSync(
		path.resolve(__dirname, '../../src/webviews/apps/specs/specs-board-app.ts'),
		'utf8',
	);
}

describe('Specs board add form', () => {
	test('uses a native submit button so Add submits the form', () => {
		const source = readSpecsBoardAppSource();

		assert.doesNotMatch(source, /<cs-button\s+type="submit"/);
		assert.match(source, /<button\s+class="add-button"\s+type="submit"/);
	});

	test('moves cards with drag and drop instead of a dropdown', () => {
		const source = readSpecsBoardAppSource();

		assert.doesNotMatch(source, /class="move-field"/);
		assert.doesNotMatch(source, /aria-label=\$\{`Move \$\{spec\.id\}`\}/);
		assert.doesNotMatch(source, /private handleMove/);
		assert.match(source, /draggable="true"/);
		assert.match(source, /@dragstart=\$\{\(event: DragEvent\) => this\.handleCardDragStart\(event, spec\)\}/);
		assert.match(source, /@drop=\$\{\(event: DragEvent\) => this\.handleLaneDrop\(event, lane\)\}/);
		assert.match(source, /kind: 'move'/);
		assert.match(source, /status: lane/);
	});

	test('archives cards through the typed move command and keeps delete separate', () => {
		const source = readSpecsBoardAppSource();

		assert.match(source, /icon="archive"/);
		assert.match(source, /label="Archive spec"/);
		assert.match(source, /data-spec-target="archive"/);
		assert.match(source, /kind: 'move'/);
		assert.match(source, /status: 'Archive'/);
		assert.match(source, /icon="trash"/);
		assert.match(source, /kind: 'delete'/);
	});
});
