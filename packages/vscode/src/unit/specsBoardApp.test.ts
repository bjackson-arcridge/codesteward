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
	test('keeps overflowing lanes scrollable within the board', () => {
		const source = readSpecsBoardAppSource();

		assert.match(
			source,
			/\.board \{[\s\S]*?min-width: 0;[\s\S]*?min-height: 0;[\s\S]*?overflow-x: auto;[\s\S]*?overflow-y: auto;/,
		);
		assert.doesNotMatch(source, /\.cards \{[\s\S]*?overflow-y:/);
	});

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

		assert.match(source, /label: 'Create worktree'/);
		assert.match(source, /label: 'Open worktree'/);
		assert.match(source, /label: 'Return to primary worktree'/);
		assert.match(source, /label: 'Finish worktree'/);
		assert.match(source, /label: 'Show worktree error'/);
		assert.match(source, /data-worktree-action=\$\{item\.action\}/);
		assert.match(source, /kind: 'worktreeAction'/);
		assert.match(source, /worktreeActionCount/);
		assert.match(source, /worktree-state=\$\{spec\.worktree\.kind\}/);
		assert.match(source, /Worktree Elsewhere/);
		assert.match(source, /gitDecoration-addedResourceForeground/);
		assert.match(source, /gitDecoration-conflictingResourceForeground/);
		assert.match(source, /icon="archive"/);
		assert.match(source, /label="Archive spec"/);
		assert.match(source, /data-spec-target="archive"/);
		assert.match(source, /kind: 'move'/);
		assert.match(source, /status: 'Archive'/);
		assert.match(source, /icon="trash"/);
		assert.match(source, /kind: 'delete'/);
	});

	test('renders row-local spec phase launch actions', () => {
		const source = readSpecsBoardAppSource();

		assert.match(source, /<span class="spec-phase-actions">\$\{this\.renderSpecPhaseActions\(spec\)\}<\/span>/);
		assert.doesNotMatch(source, /slot="body" class="spec-phase-actions"/);
		assert.match(source, /private isSelectedWorkspace\(spec: SpecCard\): boolean/);
		assert.match(source, /return spec\.workspace === undefined \|\| spec\.workspace === this\.selectedWorkspace;/);
		assert.match(source, /label="Plan spec"/);
		assert.match(source, /data-spec-target="planning"/);
		assert.match(source, /label="Implement spec"/);
		assert.match(source, /data-spec-target="implementation"/);
		assert.match(source, /label="Review spec"/);
		assert.match(source, /data-spec-target="review"/);
		assert.match(source, /private launchSpec\(spec: SpecCard, phase: SpecSessionPhase\): void/);
		assert.match(source, /kind: 'launch'/);
		assert.match(source, /phase,/);
		assert.doesNotMatch(source, /label="Open spec"/);
	});
});
