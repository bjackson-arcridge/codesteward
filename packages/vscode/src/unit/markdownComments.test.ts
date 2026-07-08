import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parseMarkdownComments, renderMarkdownCommentsAsBubbles } from '../markdownComments';

describe('parseMarkdownComments', () => {
	test('parses a single HTML comment with source ranges', () => {
		const markdown = 'Before <!-- hello --> after';
		const comments = parseMarkdownComments(markdown);

		assert.equal(comments.length, 1);
		assert.deepEqual(comments[0], {
			body: ' hello ',
			startOffset: 7,
			endOffset: 21,
			bodyStartOffset: 11,
			bodyEndOffset: 18,
		});
	});

	test('preserves source order and multi-line bodies', () => {
		const markdown = [
			'<!-- first -->',
			'Body',
			'<!-- second',
			'line -->',
		].join('\n');
		const comments = parseMarkdownComments(markdown);

		assert.equal(comments.length, 2);
		assert.equal(comments[0].body, ' first ');
		assert.equal(comments[1].body, ' second\nline ');
		assert.ok(comments[0].startOffset < comments[1].startOffset);
	});

	test('ignores malformed comments', () => {
		assert.deepEqual(parseMarkdownComments('Before <!-- missing close'), []);
	});
});

describe('renderMarkdownCommentsAsBubbles', () => {
	test('renders comments as escaped plain text bubbles', () => {
		const rendered = renderMarkdownCommentsAsBubbles('A <!-- <script>"x"&</script>\nnext --> B');

		assert.equal(rendered, [
			'A ',
			'<div style="margin: 0.35em 0 0.35em 0.5in; padding: 10px; border: 1px solid currentColor; border-radius: 0.5em; width: calc(100% - 0.5in); box-sizing: border-box;">',
			'&lt;script&gt;&quot;x&quot;&amp;&lt;/script&gt;<br>next',
			'</div>',
			' B',
		].join(''));
	});
});
