---
id: RES-0002
title: Markdown Inline Editor extension surface
domain: vscode.extension
summary: Local inspection of CodeSmith Markdown Inline Editor 1.24.2 found a decoration-based Markdown editor extension with one public toggle command and no manifest-declared integration API for third-party renderers.
created: 2026-07-08
updated: 2026-07-08
---

## Research

This research was collected on 2026-07-08 while revising `SPEC-0006`.

### Findings

- Local extension inspected: `/Users/bjackson/.vscode/extensions/codesmith.markdown-inline-editor-vscode-1.24.2`.
- Manifest publisher/name is `CodeSmith.markdown-inline-editor-vscode`.
- Installed version is `1.24.2`.
- Manifest `main` is `./dist/extension.js`.
- Manifest `license` is `MIT`.
- Manifest repository is `https://github.com/SeardnaSchmid/markdown-inline-editor-vscode.git`.
- Manifest activation events are Markdown-family language activation events:
  - `onLanguage:markdown`
  - `onLanguage:mdx`
  - `onLanguage:skill`
  - `onLanguage:markdoc`
  - `onLanguage:mdc`
  - `onLanguage:juliamarkdown`
  - `onLanguage:rmarkdown`
- Manifest contributes one user-facing command:
  - `mdInline.toggleDecorations`
- Manifest contributes the command to the editor title menu for Markdown-family language ids.
- Manifest contributes one hidden webview view for Mermaid rendering:
  - container `mdInlineRenderer`
  - view id `mdInline.mermaidRenderer`
- Manifest contributes configuration under `markdownInlineEditor.*`; inspected settings cover diff-view decoration behavior, marker opacity, link behavior, emoji/math toggles, mentions, logging, performance, and optional hex color overrides.
- Manifest does not declare an extension API, custom contribution point, comment-renderer hook, command for registering third-party decorations, or settings for arbitrary custom syntax renderers.
- README says the extension is for writing in the normal editor rather than using a preview pane.
- README describes a 3-state syntax shadowing model:
  - Rendered state hides syntax markers.
  - Ghost state shows markers faintly on the active line.
  - Raw state shows syntax when the cursor or selection is inside a construct.
- README-supported features include headings, links, mentions, autolinks, images, blockquotes, rules, lists, task lists, code blocks, YAML frontmatter, emoji, Mermaid, math, tables, and configurable syntax colors.
- README developer architecture describes:
  - `parser.ts` using remark.
  - `markdown-parse-cache.ts`.
  - `decorations.ts` with VS Code decoration type definitions.
  - `decorator.ts` for decoration orchestration.
  - `decorator/visibility-model.ts` for 3-state filtering.
  - hover/link providers and click handling around the same parse cache.
- Static inspection of `dist/extension.js` found `activate(context)` constructs `MarkdownParser`, `MarkdownParseCache`, and `Decorator`, registers providers and event handlers, registers command disposables, and returns `{ parseCache, decorator, svgProcessor: { processSvg } }`.
- The returned activation object is an implementation detail available through VS Code extension activation, but it is not documented in the README or manifest as a stable public API.
- Static inspection found the decorator uses `window.createTextEditorDecorationType`, `editor.setDecorations`, and a 150ms debounce/300ms idle timeout update scheduler.
