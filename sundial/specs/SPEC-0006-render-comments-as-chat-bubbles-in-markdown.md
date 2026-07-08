---
id: SPEC-0006
title: Render comments as chat bubbles in markdown
status: Done
created: 2026-07-08
updated: 2026-07-08
created_by: bjackson
---
# Render comments as chat bubbles in markdown

## Discovery

Sundial currently recommends and uses CodeSmith's Markdown Inline Editor for editing specs and records in-place. That extension keeps users in the normal VS Code text editor, hides Markdown syntax through `TextEditorDecorationType`s, and reveals raw Markdown around the active editing context. The desired user experience for SPEC-0006 is therefore in-editor comment bubbles that coexist with Markdown Inline Editor, not only prettier output in VS Code's separate Markdown preview pane.

Local inspection of Markdown Inline Editor 1.24.2 found no manifest-declared integration API or contribution point for third-party renderers. It contributes one public command, `mdInline.toggleDecorations`, and an internal activation object with parser/decorator instances, but that returned object is not documented as a stable public contract. Sundial should not depend on undocumented internals for the first implementation.

The lowest-risk first path is a targeted Sundial companion decoration layer: Sundial parses HTML comments in Markdown files, applies VS Code editor decorations that make those comments read as chat bubbles, and leaves CodeSmith's extension installed as the general Markdown renderer. This keeps Markdown source files as the source of truth and avoids owning a full Markdown editor fork while the compatibility question is still open.

If the companion decoration layer does not coexist cleanly with Markdown Inline Editor, Sundial should embed a local WYSIWYG Markdown editor implementation that it can extend directly. In that fallback path, Sundial should remove Markdown Inline Editor as a recommended companion extension because the comment-bubble workflow would depend on Sundial's owned editor behavior instead of a separate extension.

The main technical risk is that VS Code text editor decorations are not arbitrary block DOM. They can hide ranges, style ranges, and add before/after content, but they may not fully reproduce rich multi-line chat layout without careful range design. Implementation should start with a spike that proves one multi-line comment block can render acceptably in the normal editor while Markdown Inline Editor is active.

Follow-up validation confirmed that `TextEditorDecorationType` does not expose a supported line-height or block layout control for the decorated text range. The in-editor companion layer can provide theme-safe foreground styling over existing text plus whole-logical-line background and left/right border decorations, but it cannot reliably allocate extra vertical space, force full-width block layout, or fix word wrapping for decorated Markdown headings. Wrapped visual continuations are still part of the same document line, so decoration attachments can indent the logical line start but not each wrapped continuation. The richer `0.5in` indent, `10px` padding, and full remaining width treatment is therefore appropriate for preview-rendered HTML, while the editor decoration should stay conservative.

Sundial is moving away from Markco/Marco-style external Markdown comment management for this feature because it is heavier than the desired workflow. SPEC-0006 should render existing Markdown HTML comments in-place instead of depending on a separate recommended comment extension.

The existing VS Code markdown preview path in `packages/vscode/src/markdownPreview.ts` remains useful only as a secondary surface. It can render the same supported comment markers as richer HTML bubbles in generated preview documents, but preview rendering alone does not satisfy the in-place editing goal.

## Applicable Decision Records

- DR-0003 Webview UI uses Lit and `@floating-ui/dom` if this evolves into a custom Sundial webview; the first pass should avoid a new webview entirely.
- DR-0004 Webview file layout follows the apps/providers split if a future custom preview webview is needed.
- DR-0005 Webviews enforce a strict nonce-based CSP if a future custom preview webview is needed.
- DR-0006 Webview UI meets baseline accessibility requirements if a future custom preview webview is needed.
- DR-0007 Webview styling uses only `--vscode-*` design tokens if a future custom preview webview is needed.
- DR-0008 Extension <-> webview messages use typed discriminated unions if a future custom preview webview is needed.
- DR-0012 Sundial workflows live in the CLI-backed store; this feature must not introduce durable workflow mutations from the extension.
- DR-0014 Separate harness failures from product fixes if VS Code integration behavior disagrees with local manual preview behavior.
- DR-0017 VS Code tests use staged scenario workspaces if integration coverage is added.
- DR-0019 Preserve Command Palette Access When Removing Local UI Entry Points if preview commands or menu entries are adjusted.
- DR-0026 VS Code scenarios compile local CLI dist if integration coverage exercises CLI-backed setup.
- DR-0029 Spec Kanban preserves file-level retrieval granularity; comments remain in the individual markdown files they annotate.

## Applicable Research Notes

- RES-0002 Markdown Inline Editor extension surface.

## Planned Approach

- Define the comment rendering contract:
  - Store comments inline in the Markdown file so they diff with the surrounding spec/record text.
  - Render all HTML comments shaped as `<!-- ... -->` as chat bubbles.
  - Treat comment bodies as plain text.
  - Keep source comments valid Markdown and unobtrusive when decorations are disabled.
  - Optimize for inline editing beside the relevant prose rather than a separate comment database or side panel.
  - Keep the first format deliberately small; defer threads, resolved state, and reactions until a real workflow needs them.
- Build a targeted companion decoration layer inside the Sundial VS Code extension:
  - Activate for all Markdown-family documents.
  - Parse HTML comments from the open `TextDocument`.
  - Apply Sundial-owned `TextEditorDecorationType`s for comment ranges.
  - Hide the structural marker text from render-mode layout; keep raw markers visible while editing the block.
  - Render the body text with conservative theme-safe foreground styling over per-line editor text ranges.
  - Apply a roughly `0.5in` left indent attachment to each rendered comment body line.
  - Accept that wrapped visual continuations of a long logical line will not receive their own attachment indent.
  - Render whole-logical-line background plus left and right borders for each rendered comment body line.
  - Do not use rounded corners in the editor decoration path.
  - Suppress comment decorations for a block while the active cursor or selection intersects that block, so raw comment text is available when editing.
  - Do not rely on decoration CSS hacks such as `display: block`, full-width ranges, custom line height, or width calculations for the in-editor layer; VS Code does not guarantee those as layout controls.
  - Use border, background, overview ruler, and range styling only where VS Code editor decorations support them reliably.
  - Debounce updates on document, selection, visible editor, and configuration changes so decoration work does not fight Markdown Inline Editor's own update loop.
  - Provide `sundial.comments.renderInlineBubbles` as a normal VS Code setting with standard user/workspace/folder setting behavior.
- Spike compatibility with Markdown Inline Editor before the full implementation:
  - Open a fixture spec with Markdown Inline Editor enabled.
  - Render one single-line comment and one multi-line comment with Sundial decorations.
  - Verify Markdown Inline Editor does not erase, visually override, or constantly churn the Sundial comment decorations.
  - Verify the active-line raw/ghost behavior remains understandable when the cursor enters a comment block.
  - If overlap is poor, narrow the initial rendering to a less ambitious but stable style, such as left-gutter/blockquote-like bubbles around visible comment text.
- Reuse parsing between inline editor decorations and preview rendering:
  - Put comment marker parsing in a small shared VS Code extension-host module.
  - Use that parser from the new editor decoration layer.
  - Extend `renderMarkdownPreviewSource` to render the same comments as richer HTML bubbles in `sundial-preview:` documents, including `0.5in` left indent, `10px` padding, and full remaining width.
  - Keep source markdown untouched in both surfaces.
  - Treat preview support as secondary; inline editor rendering is the acceptance path.
- Decide the editor ownership path after the targeted spike:
  - If companion decorations work acceptably, keep the feature in Sundial and continue recommending CodeSmith Markdown Inline Editor as the general inline Markdown renderer.
  - If companion decorations do not coexist cleanly, embed a local WYSIWYG Markdown editor implementation inside Sundial so comment rendering can be extended directly.
  - In the embedded-editor path, remove Markdown Inline Editor from the recommended extensions list and make Sundial's local editor the supported inline experience for specs, research notes, and decision records.
- Keep the option analysis explicit:
  - Targeted Sundial companion layer is preferred for the first pass because it is small and independent of third-party release cadence.
  - Embedding a local WYSIWYG editor is the fallback when the companion layer fails, because Sundial then needs direct control over the Markdown rendering model.
  - Forking or vendoring should be scoped to the editor capabilities Sundial actually needs, with clear attribution/license handling, rather than blindly carrying unrelated surfaces forever.
- Keep styling conservative:
  - Use VS Code theme colors and `--vscode-*` tokens where a webview is involved.
  - Use `ThemeColor` and inherited editor styling for editor decorations.
  - Avoid remote assets, scripts, and custom webviews for the in-editor first pass.
  - Make bubbles readable in light, dark, and high-contrast themes.
- Expose controls without disrupting current workflows:
  - Add a normal Sundial setting to toggle comment bubbles.
  - Do not remove or wrap CodeSmith's existing `mdInline.toggleDecorations` command.
  - Keep existing Sundial record/research preview commands available.

## Rejected Alternatives

- Building only a custom Sundial markdown-preview webview. Rejected because the core request is in-place rendering alongside Markdown Inline Editor, not a separate reading pane.
- Recommending or depending on Markco/Marco for comment authoring. Rejected because the project is moving away from that extension as too heavy for this focused inline-comment workflow.
- Depending on Markdown Inline Editor's returned activation object. Rejected for the first pass because local inspection found it but the extension does not document it as a public API.
- Forking Markdown Inline Editor immediately. Rejected because the extension is a full Markdown editor with parser, decorations, hovers, Mermaid, math, link handling, and tests; owning that surface is far larger than the comment bubble feature.
- Embedding Markdown Inline Editor wholesale before the companion-decoration spike. Rejected because Sundial should first verify whether a smaller decoration layer can coexist cleanly. Embedding becomes the fallback if that spike fails.
- Rewriting markdown source comments into bubble markup on disk. Rejected because rendering should be non-destructive and comments should remain plain Markdown-compatible when decorations are disabled.
- Adding workflow/status behavior tied to comments. Rejected because comments are review annotations, not spec lifecycle state.

## Test Plan

- Add unit coverage for the shared Sundial comment parser:
  - A single HTML comment is parsed with body and source ranges.
  - Multiple comments preserve source order and source ranges.
  - Multi-line comments preserve body text and editable ranges.
  - Malformed or partial markers do not throw.
- Add unit coverage for decoration planning:
  - HTML comments produce the expected marker-hide and body/bubble decoration ranges.
  - Decorations are scoped to Markdown-family documents.
  - Decoration planning is disabled when the Sundial comment bubble setting is off.
- Add preview transformer coverage in `packages/vscode/src/unit/markdownPreview.test.ts`:
  - Supported comments render as chat bubbles in generated preview source.
  - Surrounding markdown remains intact.
  - Frontmatter summary and metadata rendering still work when comments are present.
- Add escaping coverage:
  - Body text escapes `<`, `>`, `&`, and quote-sensitive content as needed.
  - Raw HTML or script-like content inside a comment renders inertly.
- Add configuration coverage for the Sundial setting contribution.
- Add manual VS Code smoke coverage:
  - Markdown Inline Editor enabled, Sundial comment bubbles enabled.
  - Markdown Inline Editor disabled, Sundial comment bubbles enabled.
  - Light, dark, high contrast, and high contrast light themes.
  - Cursor entering/exiting a comment marker and body.
  - Multi-line comment editing without layout churn.
- If the companion-decoration spike fails and Sundial embeds a local editor, add migration-oriented coverage:
  - Markdown Inline Editor is no longer recommended in the VS Code README.
  - Sundial-owned editor behavior renders comments inline without depending on `mdInline.toggleDecorations`.
  - Existing spec/research/decision markdown opens through the intended Sundial editor path when invoked from Sundial UI.
- Add integration coverage only if the decoration layer exposes diagnostics that can be asserted reliably in staged VS Code workspaces.
- Run targeted tests during implementation:
  - `npm --workspace packages/vscode run test:unit`
- Because this touches VS Code editor behavior and command/configuration surface, run the broader VS Code checks and the project broad regression set before finalizing:
  - `npm run check-types`
  - `npm run lint`
  - `npm run test:unit`
  - `npm test`

## Open Questions

- None for the first implementation. User answers on 2026-07-08: render all HTML comments, treat bodies as plain text, apply to all Markdown files, expose the toggle as a normal setting, and use a rounded box indented by roughly half an inch.
- Deferred fallback question: if embedding is ever required, should Sundial vendor a narrowed subset of Markdown Inline Editor or build a smaller editor around only the Markdown constructs used in Sundial records?

## Implementation Log

- 2026-07-08: Revised the plan after recovering the original question: Sundial uses CodeSmith Markdown Inline Editor, and the preferred first pass is a targeted Sundial companion decoration layer that coexists with that extension. Forking or embedding Markdown Inline Editor is a fallback only if decoration compatibility fails.
- 2026-07-08: Removed the Markco/Marco assumption; Sundial is moving away from that recommendation and prefers inline comments rendered in-place in the normal Markdown editor.
- 2026-07-08: Clarified fallback: if companion decorations do not coexist cleanly, Sundial will embed a local WYSIWYG Markdown editor that it can extend and remove Markdown Inline Editor as a recommended companion extension.
- 2026-07-08: Applied open-question answers: render all HTML comments in all Markdown files as plain-text rounded bubbles, indent bubbles roughly half an inch, and expose the feature through a normal VS Code setting.
- 2026-07-08: Implemented shared HTML-comment parsing, inline Markdown editor decorations, preview bubble rendering, and the `sundial.comments.renderInlineBubbles` resource-scoped setting.
- 2026-07-08: Tuned preview bubble layout to use a `0.5in` left indent, `10px` text padding, and full remaining width.
- 2026-07-08: Forced bubble body text to the VS Code editor foreground token so comment-token colors do not become white-on-white in light themes.
- 2026-07-08: Confirmed in-editor decorations cannot reliably force larger line height, full-width blocks, or word wrapping; kept richer layout in preview HTML and limited editor rendering to conservative text/background/divider styling.
- 2026-07-08: Replaced the rounded editor outline with whole-line divider decorations above and below inactive comment blocks; decorations now suppress while the cursor or selection is inside the block.
- 2026-07-08: Corrected divider ranges to use the line text range rather than newline-inclusive ranges so top and bottom borders apply only to the first and last line of each comment block.
- 2026-07-08: Hid `<!--` and `-->` marker ranges with render-mode layout suppression and split body decorations per line so each rendered line receives the `0.5in` left indent.
- 2026-07-08: Removed editor body background because VS Code applies it unevenly with wrapped lines; documented that attachment-based indentation cannot repeat on wrapped visual continuations.
- 2026-07-08: Switched editor framing from top/bottom dividers to whole-line background with left/right borders on every rendered comment body line.

## Test Log

- 2026-07-08: Passed `npm --workspace packages/vscode run test:unit`.
- 2026-07-08: Passed `npm run check-types`.
- 2026-07-08: Passed `npm run lint`.
- 2026-07-08: Passed `npm run test:unit`.
- 2026-07-08: Initial `npm test` failed because sandboxed DNS could not resolve `update.code.visualstudio.com`; reran with approved network access and passed.
- 2026-07-08: After visual tuning, passed `npm --workspace packages/vscode run test:unit`, `npm --workspace packages/vscode run check-types`, and `npm run lint`.
- 2026-07-08: After light/dark readability fix, passed `npm --workspace packages/vscode run test:unit`, `npm --workspace packages/vscode run check-types`, and `npm run lint`.
- 2026-07-08: After reverting the in-editor block-layout hack, passed `npm --workspace packages/vscode run test:unit`, `npm --workspace packages/vscode run check-types`, and `npm run lint`.
- 2026-07-08: After switching to inactive-block divider lines, passed `npm --workspace packages/vscode run test:unit`, `npm --workspace packages/vscode run check-types`, and `npm run lint`.
- 2026-07-08: After tightening divider ranges to first/last line only, passed `npm --workspace packages/vscode run test:unit`, `npm --workspace packages/vscode run check-types`, and `npm run lint`.
- 2026-07-08: After hiding comment delimiters from render-mode layout and adding per-line left indents, passed `npm --workspace packages/vscode run test:unit`, `npm --workspace packages/vscode run check-types`, and `npm run lint`.
- 2026-07-08: After removing editor body background and documenting wrapped-line indentation limits, passed `npm --workspace packages/vscode run test:unit`, `npm --workspace packages/vscode run check-types`, and `npm run lint`.
- 2026-07-08: After switching editor framing to whole-line background with left/right borders, passed `npm --workspace packages/vscode run test:unit`, `npm --workspace packages/vscode run check-types`, and `npm run lint`.
