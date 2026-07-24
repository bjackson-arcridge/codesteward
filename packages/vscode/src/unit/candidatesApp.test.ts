import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, test } from 'node:test';

function readCandidatesAppSource(): string {
	return fs.readFileSync(
		path.resolve(__dirname, '../../src/webviews/apps/candidates/candidates-app.ts'),
		'utf8',
	);
}

describe('Candidates app card actions', () => {
	test('opens rendered markdown from the title without a duplicate preview action', () => {
		const source = readCandidatesAppSource();

		assert.match(source, /data-candidate-target="title"/);
		assert.match(source, /sendCandidateCommand\('preview', candidate\)/);
		assert.doesNotMatch(source, /data-candidate-target="preview"/);
		assert.doesNotMatch(source, /label="View rendered markdown"/);
	});

	test('does not render the removed bootstrap action', () => {
		const source = readCandidatesAppSource();

		assert.doesNotMatch(source, /bootstrap/i);
		assert.doesNotMatch(source, /provider-selector/);
	});
});
