import * as vscode from 'vscode';
import { markdownCommentBubbleIndent, parseMarkdownComments } from './markdownComments';

const settingKey = 'comments.renderInlineBubbles';

export class MarkdownCommentBubbleDecorations implements vscode.Disposable {
	private readonly disposables: vscode.Disposable[] = [];
	private readonly markerDecoration: vscode.TextEditorDecorationType;
	private readonly bodyDecoration: vscode.TextEditorDecorationType;
	private readonly lineFrameDecoration: vscode.TextEditorDecorationType;
	private updateTimer: NodeJS.Timeout | undefined;

	constructor() {
		this.markerDecoration = vscode.window.createTextEditorDecorationType({
			opacity: '0',
			rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
			textDecoration: 'none; display: none;',
		});
		this.bodyDecoration = vscode.window.createTextEditorDecorationType({
			before: {
				contentText: ' ',
				width: markdownCommentBubbleIndent,
			},
			color: new vscode.ThemeColor('editor.foreground'),
			overviewRulerColor: new vscode.ThemeColor('editorInfo.foreground'),
			overviewRulerLane: vscode.OverviewRulerLane.Right,
			rangeBehavior: vscode.DecorationRangeBehavior.OpenOpen,
			textDecoration: 'none; color: var(--vscode-editor-foreground) !important; font-style: normal;',
		});
		this.lineFrameDecoration = createLineFrameDecoration();
		this.disposables.push(
			this.markerDecoration,
			this.bodyDecoration,
			this.lineFrameDecoration,
			vscode.window.onDidChangeVisibleTextEditors(() => this.scheduleUpdate()),
			vscode.window.onDidChangeTextEditorSelection(event => this.scheduleUpdateForEditor(event.textEditor)),
			vscode.workspace.onDidChangeTextDocument(event => this.scheduleUpdateForDocument(event.document)),
			vscode.workspace.onDidChangeConfiguration(event => {
				if (event.affectsConfiguration('sundial.comments.renderInlineBubbles')) {
					this.scheduleUpdate();
				}
			}),
		);
		this.scheduleUpdate();
	}

	dispose(): void {
		if (this.updateTimer !== undefined) {
			clearTimeout(this.updateTimer);
		}
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
	}

	private scheduleUpdateForDocument(document: vscode.TextDocument): void {
		for (const editor of vscode.window.visibleTextEditors) {
			if (editor.document === document) {
				this.scheduleUpdateForEditor(editor);
				return;
			}
		}
	}

	private scheduleUpdateForEditor(editor: vscode.TextEditor): void {
		for (const visibleEditor of vscode.window.visibleTextEditors) {
			if (visibleEditor === editor) {
				this.scheduleUpdate();
				return;
			}
		}
	}

	private scheduleUpdate(): void {
		if (this.updateTimer !== undefined) {
			clearTimeout(this.updateTimer);
		}

		this.updateTimer = setTimeout(() => {
			this.updateTimer = undefined;
			this.updateVisibleEditors();
		}, 50);
	}

	private updateVisibleEditors(): void {
		for (const editor of vscode.window.visibleTextEditors) {
			this.updateEditor(editor);
		}
	}

	private updateEditor(editor: vscode.TextEditor): void {
		if (!isMarkdownDocument(editor.document) || !isEnabled(editor.document.uri)) {
			editor.setDecorations(this.markerDecoration, []);
			editor.setDecorations(this.bodyDecoration, []);
			editor.setDecorations(this.lineFrameDecoration, []);
			return;
		}

		const commentDecorations = createCommentDecorations(editor.document, editor.selections);
		editor.setDecorations(this.markerDecoration, commentDecorations.markerRanges);
		editor.setDecorations(this.bodyDecoration, commentDecorations.bodyRanges);
		editor.setDecorations(this.lineFrameDecoration, commentDecorations.frameLineRanges);
	}
}

export function createCommentDecorations(document: vscode.TextDocument, selections: readonly vscode.Selection[] = []): {
	readonly markerRanges: readonly vscode.Range[];
	readonly bodyRanges: readonly vscode.Range[];
	readonly frameLineRanges: readonly vscode.Range[];
} {
	const markerRanges: vscode.Range[] = [];
	const bodyRanges: vscode.Range[] = [];
	const frameLineRanges: vscode.Range[] = [];

	for (const comment of parseMarkdownComments(document.getText())) {
		const bodyStart = document.positionAt(comment.bodyStartOffset);
		const bodyEnd = document.positionAt(comment.bodyEndOffset);
		if (selections.some(selection => selectionTouchesLines(selection, bodyStart.line, bodyEnd.line))) {
			continue;
		}

		markerRanges.push(
			new vscode.Range(document.positionAt(comment.startOffset), document.positionAt(comment.bodyStartOffset)),
			new vscode.Range(document.positionAt(comment.bodyEndOffset), document.positionAt(comment.endOffset)),
		);
		if (!bodyStart.isEqual(bodyEnd)) {
			bodyRanges.push(...bodyLineRanges(document, bodyStart, bodyEnd));
		}
		frameLineRanges.push(...wholeLineRanges(document, bodyStart.line, bodyEnd.line));
	}

	return { markerRanges, bodyRanges, frameLineRanges };
}

function bodyLineRanges(document: vscode.TextDocument, bodyStart: vscode.Position, bodyEnd: vscode.Position): readonly vscode.Range[] {
	const ranges: vscode.Range[] = [];
	for (let line = bodyStart.line; line <= bodyEnd.line; line += 1) {
		const lineStart = line === bodyStart.line ? bodyStart : new vscode.Position(line, 0);
		const lineEnd = line === bodyEnd.line ? bodyEnd : document.lineAt(line).range.end;
		if (!lineStart.isEqual(lineEnd)) {
			ranges.push(new vscode.Range(lineStart, lineEnd));
		}
	}
	return ranges;
}

function createLineFrameDecoration(): vscode.TextEditorDecorationType {
	return vscode.window.createTextEditorDecorationType({
		backgroundColor: new vscode.ThemeColor('editorWidget.background'),
		borderColor: new vscode.ThemeColor('editorLineNumber.foreground'),
		borderStyle: 'solid',
		borderWidth: '0 1px',
		isWholeLine: true,
		rangeBehavior: vscode.DecorationRangeBehavior.OpenOpen,
	});
}

function selectionTouchesLines(selection: vscode.Selection, firstLine: number, lastLine: number): boolean {
	const selectionStartLine = Math.min(selection.anchor.line, selection.active.line);
	const selectionEndLine = Math.max(selection.anchor.line, selection.active.line);
	return selectionStartLine <= lastLine && selectionEndLine >= firstLine;
}

function wholeLineRange(document: vscode.TextDocument, line: number): vscode.Range {
	return document.lineAt(line).range;
}

function wholeLineRanges(document: vscode.TextDocument, firstLine: number, lastLine: number): readonly vscode.Range[] {
	const ranges: vscode.Range[] = [];
	for (let line = firstLine; line <= lastLine; line += 1) {
		ranges.push(wholeLineRange(document, line));
	}
	return ranges;
}

function isEnabled(uri: vscode.Uri): boolean {
	return vscode.workspace.getConfiguration('sundial', uri).get<boolean>(settingKey, true);
}

function isMarkdownDocument(document: vscode.TextDocument): boolean {
	if (document.languageId === 'markdown') {
		return true;
	}

	const path = document.uri.path.toLowerCase();
	return path.endsWith('.md') || path.endsWith('.markdown') || path.endsWith('.mdown') || path.endsWith('.mkd');
}
