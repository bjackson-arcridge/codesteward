export interface MarkdownComment {
	readonly body: string;
	readonly startOffset: number;
	readonly endOffset: number;
	readonly bodyStartOffset: number;
	readonly bodyEndOffset: number;
}

export const markdownCommentBubbleIndent = '0.5in';
export const markdownCommentBubblePadding = '10px';
export const markdownCommentBubbleWidth = `calc(100% - ${markdownCommentBubbleIndent})`;

export function parseMarkdownComments(markdown: string): readonly MarkdownComment[] {
	const comments: MarkdownComment[] = [];
	const commentPattern = /<!--([\s\S]*?)-->/g;
	let match: RegExpExecArray | null;

	while ((match = commentPattern.exec(markdown)) !== null) {
		const rawBody = match[1];
		const startOffset = match.index;
		const bodyStartOffset = startOffset + '<!--'.length;
		const bodyEndOffset = bodyStartOffset + rawBody.length;
		const endOffset = bodyEndOffset + '-->'.length;
		comments.push({
			body: rawBody,
			startOffset,
			endOffset,
			bodyStartOffset,
			bodyEndOffset,
		});
	}

	return comments;
}

export function renderMarkdownCommentsAsBubbles(markdown: string): string {
	const comments = parseMarkdownComments(markdown);
	if (comments.length === 0) {
		return markdown;
	}

	const parts: string[] = [];
	let cursor = 0;
	for (const comment of comments) {
		parts.push(markdown.slice(cursor, comment.startOffset));
		parts.push(renderCommentBubble(comment.body));
		cursor = comment.endOffset;
	}
	parts.push(markdown.slice(cursor));
	return parts.join('');
}

function renderCommentBubble(body: string): string {
	const text = escapeHtml(body.trim());
	return [
		`<div style="${markdownCommentBubblePreviewStyle()}">`,
		text.replace(/\r?\n/g, '<br>'),
		'</div>',
	].join('');
}

function markdownCommentBubblePreviewStyle(): string {
	return [
		`margin: 0.35em 0 0.35em ${markdownCommentBubbleIndent}`,
		`padding: ${markdownCommentBubblePadding}`,
		'border: 1px solid currentColor',
		'border-radius: 0.5em',
		`width: ${markdownCommentBubbleWidth}`,
		'box-sizing: border-box',
	].join('; ').concat(';');
}

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}
