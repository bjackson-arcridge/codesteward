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
});
