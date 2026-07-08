---
id: SPEC-0006
title: Render comments as chat bubbles in markdown
status: Backlog
created: 2026-07-08
updated: 2026-07-08
created_by: bjackson
---

# Render comments as chat bubbles in markdown

## Discovery

Sundial currently recommends and uses CodeSmith's Markdown Inline Editor for editing specs and records in-place. That extension keeps users in the normal VS Code text editor, hides Markdown syntax through `TextEditorDecorationType`s, and reveals raw Markdown around the active editing context. The desired user experience for SPEC-0006 is therefore in-editor comment bubbles that coexist with Markdown Inline Editor, not only prettier output in VS Code's separate Markdown preview pane.

Local inspection of Markdown Inline Editor 1.24.2 found no manifest-declared integration API or contribution point for third-party renderers. It contributes one public command, `mdInline.toggleDecorations`, and an internal activation object with parser/decorator instances, but that returned object is not documented as a stable public contract. Sundial should not depend on undocumented internals for the first implementation.

The lowest-risk first path is a targeted Sundial companion decoration layer: Sundial parses its own supported comment markers in Markdown files under `sundial/`, applies VS Code editor decorations that make those markers read as chat bubbles, and leaves CodeSmith's extension installed as the general Markdown renderer. This keeps Sundial source files as the source of truth and avoids owning a full Markdown editor fork while the compatibility question is still open.

If the companion decoration layer does not coexist cleanly with Markdown Inline Editor, Sundial should embed a local WYSIWYG Markdown editor implementation that it can extend directly. In that fallback path, Sundial should remove Markdown Inline Editor as a recommended companion extension because the comment-bubble workflow would depend on Sundial's owned editor behavior instead of a separate extension.

The main technical risk is that VS Code text editor decorations are not arbitrary block DOM. They can hide ranges, style ranges, and add before/after content, but they may not fully reproduce rich multi-line chat layout without careful range design. Implementation should start with a spike that proves one multi-line comment block can render acceptably in the normal editor while Markdown Inline Editor is active.

Sundial is moving away from Markco/Marco-style external Markdown comment management for this feature because it is heavier than the desired workflow. SPEC-0006 should define a small Sundial-owned inline comment marker and renderer instead of depending on a separate recommended comment extension.

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

- Define a Sundial-owned comment marker format before rendering:
  - Store comments inline in the Markdown file so they diff with the surrounding spec/record text.
  - Use a marker shape that remains valid Markdown and unobtrusive when decorations are disabled.
  - Optimize for inline editing beside the relevant prose rather than a separate comment database or side panel.
  - Avoid interpreting arbitrary HTML comments as user-visible comments because Sundial already uses HTML comments for managed instruction markers.
  - Include enough metadata for author and timestamp when available, but make body text the only required field.
  - Keep the first format deliberately small; defer threads, resolved state, and reactions until a real workflow needs them.
- Build a targeted companion decoration layer inside the Sundial VS Code extension:
  - Activate for Markdown-family documents under `sundial/specs`, `sundial/research`, and `sundial/decisions`.
  - Parse supported comment markers from the open `TextDocument`.
  - Apply Sundial-owned `TextEditorDecorationType`s for comment ranges.
  - Hide only the structural marker text; keep comment body editable in-place.
  - Use `before`/`after`, border, background, overview ruler, and range styling only where VS Code editor decorations support them reliably.
  - Debounce updates on document, selection, visible editor, and configuration changes so decoration work does not fight Markdown Inline Editor's own update loop.
  - Provide a Sundial setting such as `sundial.comments.renderInlineBubbles` to enable/disable the companion layer independently from CodeSmith's `mdInline.toggleDecorations`.
- Spike compatibility with Markdown Inline Editor before the full implementation:
  - Open a fixture spec with Markdown Inline Editor enabled.
  - Render one single-line comment and one multi-line comment with Sundial decorations.
  - Verify Markdown Inline Editor does not erase, visually override, or constantly churn the Sundial comment decorations.
  - Verify the active-line raw/ghost behavior remains understandable when the cursor enters a comment block.
  - If overlap is poor, narrow the initial rendering to a less ambitious but stable style, such as left-gutter/blockquote-like bubbles around visible comment text.
- Reuse parsing between inline editor decorations and preview rendering:
  - Put comment marker parsing in a small shared VS Code extension-host module.
  - Use that parser from the new editor decoration layer.
  - Extend `renderMarkdownPreviewSource` to render the same comments as richer HTML bubbles in `sundial-preview:` documents.
  - Keep source markdown untouched in both surfaces.
  - Treat preview support as secondary; inline editor rendering is the acceptance path.
- Decide the editor ownership path after the targeted spike:
  - If companion decorations work acceptably, keep the feature in Sundial and continue recommending CodeSmith Markdown Inline Editor as the general inline Markdown renderer.
  - If companion decorations do not coexist cleanly, embed a local WYSIWYG Markdown editor implementation inside Sundial so comment rendering can be extended directly.
  - In the embedded-editor path, remove Markdown Inline Editor from the recommended extensions list and make Sundial's local editor the supported inline experience for specs, research notes, and decision records.
  - Treat upstream contribution or a stable CodeSmith custom-renderer hook as a nice long-term possibility, not a blocker for embedding if the companion layer fails.
- Keep the option analysis explicit:
  - Targeted Sundial companion layer is preferred for the first pass because it is small, scoped to Sundial files, and independent of third-party release cadence.
  - Embedding a local WYSIWYG editor is the fallback when the companion layer fails, because Sundial then needs direct control over the Markdown rendering model.
  - Forking or vendoring should be scoped to the editor capabilities Sundial actually needs, with clear attribution/license handling, rather than blindly carrying unrelated surfaces forever.
  - Upstream contribution is useful if CodeSmith accepts a comment renderer or plugin hook, but Sundial should not wait on upstream if the local workflow needs owned editor behavior.
- Keep styling conservative:
  - Use VS Code theme colors and `--vscode-*` tokens where a webview is involved.
  - Use `ThemeColor` and inherited editor styling for editor decorations.
  - Avoid remote assets, scripts, and custom webviews for the in-editor first pass.
  - Make bubbles readable in light, dark, and high-contrast themes.
- Expose controls without disrupting current workflows:
  - Add a Sundial command and setting to toggle comment bubbles for the current workspace or globally.
  - Do not remove or wrap CodeSmith's existing `mdInline.toggleDecorations` command.
  - Keep existing Sundial record/research preview commands available.

## Rejected Alternatives

- Building only a custom Sundial markdown-preview webview. Rejected because the core request is in-place rendering alongside Markdown Inline Editor, not a separate reading pane.
- Recommending or depending on Markco/Marco for comment authoring. Rejected because the project is moving away from that extension as too heavy for this focused inline-comment workflow.
- Depending on Markdown Inline Editor's returned activation object. Rejected for the first pass because local inspection found it but the extension does not document it as a public API.
- Forking Markdown Inline Editor immediately. Rejected because the extension is a full Markdown editor with parser, decorations, hovers, Mermaid, math, link handling, and tests; owning that surface is far larger than the comment bubble feature.
- Embedding Markdown Inline Editor wholesale before the companion-decoration spike. Rejected because Sundial should first verify whether a smaller decoration layer can coexist cleanly. Embedding becomes the fallback if that spike fails.
- Rewriting markdown source comments into bubble markup on disk. Rejected because rendering should be non-destructive and comments should remain plain Markdown-compatible when decorations are disabled.
- Rendering every HTML comment as a visible bubble. Rejected because Sundial uses HTML comments for managed instruction markers and other hidden metadata; only Sundial-supported comment markers should become visible bubbles.
- Adding workflow/status behavior tied to comments. Rejected because comments are review annotations, not spec lifecycle state.

## Test Plan

- Add unit coverage for the shared Sundial comment parser:
  - A single comment marker is parsed with author, timestamp, and body when present.
  - Multiple comments preserve source order and source ranges.
  - Multi-line comments preserve body text and editable ranges.
  - Malformed or partial markers do not throw.
  - Managed Sundial instruction comments and ordinary HTML comments are ignored.
- Add unit coverage for decoration planning:
  - Supported comment markers produce the expected marker-hide and body/bubble decoration ranges.
  - Decorations are scoped to Sundial markdown paths.
  - Decoration planning is disabled when the Sundial comment bubble setting is off.
- Add preview transformer coverage in `packages/vscode/src/unit/markdownPreview.test.ts`:
  - Supported comments render as chat bubbles in generated preview source.
  - Surrounding markdown remains intact.
  - Frontmatter summary and metadata rendering still work when comments are present.
- Add escaping coverage:
  - Author, timestamp, and body text escape `<`, `>`, `&`, and quote-sensitive content as needed.
  - Raw HTML or script-like content inside a comment renders inertly.
  - Ordinary non-Sundial HTML comments remain hidden or unchanged and do not become bubbles.
- Add command/configuration coverage if a Sundial toggle command or setting is introduced.
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

- What exact inline comment marker format should Sundial own?
- Should comment bodies remain plain text for the first pass, or support limited Markdown inside the bubble body?
- Should comment bubbles render only in `sundial/` files, or in any Markdown document inside a Sundial workspace?
- Should the toggle be global, workspace-scoped, per-file, or all three over time?
- If the targeted companion layer is visually acceptable, should Sundial still open an upstream issue proposing a stable Markdown Inline Editor custom-renderer hook?
- What minimum visual treatment counts as a "chat bubble" inside VS Code editor decoration limits?
- If embedding is required, should Sundial vendor a narrowed subset of Markdown Inline Editor or build a smaller editor around only the Markdown constructs used in Sundial records?

## Implementation Log

- 2026-07-08: Revised the plan after recovering the original question: Sundial uses CodeSmith Markdown Inline Editor, and the preferred first pass is a targeted Sundial companion decoration layer that coexists with that extension. Forking or embedding Markdown Inline Editor is a fallback only if decoration compatibility fails and upstream integration is unavailable.
- 2026-07-08: Removed the Markco/Marco assumption; Sundial is moving away from that recommendation and prefers inline comments rendered in-place in the normal Markdown editor.
- 2026-07-08: Clarified fallback: if companion decorations do not coexist cleanly, Sundial will embed a local WYSIWYG Markdown editor that it can extend and remove Markdown Inline Editor as a recommended companion extension.

## Test Log
