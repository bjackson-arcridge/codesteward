import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, test } from 'node:test';

function readWebviewSource(relativePath: string): string {
	return fs.readFileSync(
		path.resolve(__dirname, '../../src/webviews/apps', relativePath),
		'utf8',
	);
}

describe('Webview icons', () => {
	test('defines glyphs for every worktree card action', () => {
		const iconSource = readWebviewSource('shared/components/cs-icon.ts');
		const worktreeSources = [
			readWebviewSource('records/records-app.ts'),
			readWebviewSource('specs/specs-board-app.ts'),
		];
		const definedIcons = new Set(
			[...iconSource.matchAll(/^\s*(?:'([^']+)'|([a-z]+)):\s*'\\u[0-9a-f]{4}',?$/gm)]
				.map(match => match[1] ?? match[2]),
		);
		const worktreeActionIcons = new Set(
			worktreeSources.flatMap(source =>
				[...source.matchAll(/\{ action: '[^']+' as const, icon: '([^']+)'/g)]
					.map(match => match[1]),
			),
		);

		assert.ok(worktreeActionIcons.size > 0, 'Expected to find worktree action icons');
		for (const icon of worktreeActionIcons) {
			assert.ok(definedIcons.has(icon), `Expected cs-icon to define the ${icon} worktree action glyph`);
		}
	});
});
