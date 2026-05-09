import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { renderMarkdownPreviewSource } from '../markdownPreview';

describe('renderMarkdownPreviewSource', () => {
	test('renders title, domain, and tags above the body and remaining fields below', () => {
		const rendered = renderMarkdownPreviewSource([
			'---',
			'id: CAND-0001',
			'title: Fixture candidate',
			'domain: vscode.webview',
			'tags:',
			'  - fixtures',
			'  - rendering',
			'proposed_tags:',
			'  preview-rendering: Preview rendering behavior.',
			'---',
			'',
			'## Decision',
			'',
			'Render previews.',
			'',
		].join('\n'));

		assert.equal(rendered, [
			'# Fixture candidate',
			'**domain:** vscode.webview **tags:** fixtures,rendering',
			'',
			'## Decision',
			'',
			'Render previews.',
			'',
			'## Metadata',
			'',
			'<table style="border-collapse: collapse; border-spacing: 0;">',
			'<tbody>',
			'<tr><td align="right" style="border: none; padding-right: 0.75em; vertical-align: top;"><strong>id</strong></td><td align="left" style="border: none; border-left: 1px solid currentColor; padding-left: 0.75em; vertical-align: top;">CAND-0001</td></tr>',
			'<tr><td align="right" style="border: none; padding-right: 0.75em; vertical-align: top;"><strong>proposed_tags</strong></td><td align="left" style="border: none; border-left: 1px solid currentColor; padding-left: 0.75em; vertical-align: top;">preview-rendering: Preview rendering behavior.</td></tr>',
			'</tbody>',
			'</table>',
			'',
		].join('\n'));
		assert.equal(rendered.includes('```'), false);
	});

	test('escapes markdown table cell content', () => {
		const rendered = renderMarkdownPreviewSource([
			'---',
			'title: A | B < C > D',
			'tags:',
			'  - alpha|beta',
			'status: accepted | pending < done',
			'---',
			'',
			'Body.',
			'',
		].join('\n'));

		assert.equal(rendered, [
			'# A | B &lt; C &gt; D',
			'**domain:** all **tags:** alpha|beta',
			'',
			'Body.',
			'',
			'## Metadata',
			'',
			'<table style="border-collapse: collapse; border-spacing: 0;">',
			'<tbody>',
			'<tr><td align="right" style="border: none; padding-right: 0.75em; vertical-align: top;"><strong>status</strong></td><td align="left" style="border: none; border-left: 1px solid currentColor; padding-left: 0.75em; vertical-align: top;">accepted | pending &lt; done</td></tr>',
			'</tbody>',
			'</table>',
			'',
		].join('\n'));
	});

	test('leaves markdown without frontmatter unchanged', () => {
		assert.equal(renderMarkdownPreviewSource('## Decision\n\nNo frontmatter.\n'), '## Decision\n\nNo frontmatter.\n');
	});
});
