import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, test } from 'node:test';

function readRecordsAppSource(): string {
	return fs.readFileSync(
		path.resolve(__dirname, '../../src/webviews/apps/records/records-app.ts'),
		'utf8',
	);
}

describe('Records app specs sidebar mode', () => {
	test('renders a prominent Kanban launcher in specs mode', () => {
		const source = readRecordsAppSource();

		assert.match(source, /private renderSpecs\(\)/);
		assert.match(source, /class="specs-launcher"/);
		assert.match(source, /Customize Spec Template/);
		assert.match(source, /kind: 'openSpecTemplate'/);
		assert.ok(source.indexOf('Customize Spec Template') < source.indexOf('Open Kanban View'));
		assert.match(source, /Open Kanban View/);
		assert.match(source, /kind: 'openBoard'/);
	});

	test('renders grouped specs without repeated status badges', () => {
		const source = readRecordsAppSource();

		assert.match(source, /private renderSpecGroup\(group: SpecRecordGroup\)/);
		assert.match(source, /data-spec-group=\$\{group\.status\}/);
		assert.match(source, /kind: 'toggleSpecGroup'/);
		assert.match(source, /this\.renderRecord\(record, \{ showStatusBadge: false \}\)/);
	});

	test('renders specs sidebar create, delete, and drag controls', () => {
		const source = readRecordsAppSource();

		assert.match(source, /private renderSpecAddForm\(\)/);
		assert.match(source, /data-action="add-spec"/);
		assert.match(source, /<input name="title" type="text" aria-label="Spec title" placeholder="New spec" autocomplete="off" \/>/);
		assert.doesNotMatch(source, /<span>Status<\/span>/);
		assert.doesNotMatch(source, /name="status"/);
		assert.match(source, /private defaultSpecStatus\(\): string/);
		assert.match(source, /return statuses\.includes\('Backlog'\) \? 'Backlog' : statuses\[0\] \?\? '';/);
		assert.match(source, /kind: 'createSpec'/);
		assert.match(source, /label: 'Create worktree'/);
		assert.match(source, /label: 'Open worktree'/);
		assert.match(source, /label: 'Return to primary worktree'/);
		assert.match(source, /label: 'Finish worktree'/);
		assert.match(source, /label: 'Show worktree error'/);
		assert.match(source, /kind: 'specWorktreeAction'/);
		assert.match(source, /data-worktree-action=\$\{item\.action\}/);
		assert.match(source, /specWorktreeActionCount/);
		assert.match(source, /worktree-state=\$\{record\.worktree\?\.kind \?\? 'none'\}/);
		assert.match(source, /Worktree Elsewhere/);
		assert.match(source, /gitDecoration-addedResourceForeground/);
		assert.match(source, /gitDecoration-conflictingResourceForeground/);
		assert.match(source, /kind: 'deleteSpec'/);
		assert.match(source, /data-record-target="delete"/);
		assert.doesNotMatch(source, /if \(this\.actionMode === 'research' \|\| this\.actionMode === 'specs'\)/);
		assert.match(source, /\?draggable=\$\{isSpec\}/);
		assert.match(source, /@drop=\$\{\(event: DragEvent\) => this\.handleSpecGroupDrop\(event, group\.status\)\}/);
		assert.match(source, /kind: 'moveSpec'/);
	});

	test('renders specs sidebar phase launch actions', () => {
		const source = readRecordsAppSource();

		assert.match(source, /<span class="spec-phase-actions">\$\{this\.renderSpecPhaseActions\(record\)\}<\/span>/);
		assert.doesNotMatch(source, /slot="body" class="spec-phase-actions"/);
		assert.match(source, /private isSelectedWorkspace\(record: RecordSummary\): boolean/);
		assert.match(source, /return record\.workspace === undefined \|\| record\.workspace === this\.selectedWorkspace;/);
		assert.match(source, /label="Plan spec"/);
		assert.match(source, /data-record-target="planning"/);
		assert.match(source, /label="Implement spec"/);
		assert.match(source, /data-record-target="implementation"/);
		assert.match(source, /label="Review spec"/);
		assert.match(source, /data-record-target="review"/);
		assert.match(source, /private launchSpec\(record: RecordSummary, phase: SpecSessionPhase\): void/);
		assert.match(source, /kind: 'launchSpec'/);
	});

	test('opens rendered Decision Record markdown from the title instead of a duplicate icon', () => {
		const source = readRecordsAppSource();

		assert.doesNotMatch(source, /label="View rendered markdown"/);
		assert.match(source, /data-record-target="title"/);
		assert.match(source, /kind: 'preview'/);
	});
});
