---
id: SPEC-0004
title: Helper functions to launch Claude or Codex sessions
status: Done
created: 2026-07-07
updated: 2026-07-12
created_by: bjackson
---

# Helper functions to launch Claude or Codex sessions

## Discovery

The feature has three session-launch phases: planning, implementation, and review.

Each launch should name the active specification and the requested phase so the provider session starts with the right context.

Planning should avoid implementation, but may write or run small code experiments to test assumptions and validate the implementation plan.

Review should audit implementation completeness, tests performed, security expectations, and unresolved risk.

These sessions should launch inside the official VS Code extensions for Codex and Claude Code so users get the provider's native chat/review UI instead of a raw subprocess stream.

Claude Code's VS Code extension documents a URI handler, `vscode://anthropic.claude-code/open?prompt=...`, that opens a Claude Code tab with a prefilled prompt. The prompt is not automatically submitted.

Codex's VS Code extension documents command IDs including `chatgpt.implementTodo`, `chatgpt.newChat`, `chatgpt.newCodexPanel`, and `chatgpt.openSidebar`, plus IDE slash commands such as `/plan` and `/review`. Public Codex docs do not document a prompt-prefill URI equivalent to Claude's handler, and static inspection of the installed extension did not find prompt handling in the contributed `newCodexPanel`, `newChat`, or URI handlers. Static inspection did find an `implementTodo` command path that hands `{ fileName, line, comment }` to the Codex webview as an `implement-todo` message.

Provider plugins are customization/capability packaging surfaces, not the primary session-launch mechanism. The launch path should use official VS Code extension commands or URI handlers; Sundial-managed skills/plugins can still provide context once the provider session starts.

The launch prompt should be intentionally small: one line that names the phase, points at the spec, and tells the provider to use the relevant Sundial skill/instructions. The detailed behavior for planning, implementation, and review belongs in skills and managed agent instructions rather than in a large prompt assembled by the VS Code extension.

## Applicable Decision Records

- DR-0011 Skill review precedes hook enforcement.
- DR-0012 Sundial workflows live in the CLI-backed store.
- DR-0020 Stewardship commands use compact top-level nouns.
- DR-0022 Managed agent instructions remain baseline alongside plugins.
- DR-0023 Agent harness installs use staged harness modules.
- DR-0025 CLI surface changes require version review.
- DR-0003 Webview UI uses Lit and `@floating-ui/dom`.
- DR-0004 Webview file layout follows the apps/providers split.
- DR-0005 Webviews enforce a strict nonce-based CSP.
- DR-0006 Webview UI meets baseline accessibility requirements.
- DR-0007 Webview styling uses only `--vscode-*` design tokens.
- DR-0008 Extension <-> webview messages use typed discriminated unions.
- DR-0009 Sidebar sections use WebviewView, not TreeView.
- DR-0010 VS Code per-item actions stay localized to the row.
- DR-0014 Separate harness failures from product fixes if VS Code integration behavior disagrees with manual smoke tests.
- DR-0017 VS Code tests use staged scenario workspaces if integration coverage is added.
- DR-0019 Preserve Command Palette Access When Removing Local UI Entry Points if command/menu entries are adjusted.
- DR-0026 VS Code scenarios compile local CLI dist if integration tests exercise new CLI commands from VS Code.

## Applicable Research Notes

- RES-0001 VS Code provider session launch surfaces.

## Planned Approach

- Build the launch surface in the existing Sundial Specs UI.
  - Add row/card-local `Plan`, `Implement`, and `Review` actions to the Specs sidebar and Specs Board while preserving the existing spawn-worktree and lifecycle actions.
  - Keep Command Palette commands available for keyboard-driven launches.
  - Route all launch requests through typed webview messages carrying `{ id, workspace, phase }`.
- Add a provider-launch abstraction in the VS Code extension host.
  - Represent supported providers as `claude` and `codex`.
  - Represent session phases as `planning`, `implementation`, and `review`.
  - Generate a one-line phase command from the selected spec id, title, file path, and phase.
  - Keep detailed phase behavior in Sundial skills and managed instructions rather than in VS Code-generated prompt bodies.
- Detect provider availability before launch.
  - Claude Code uses `vscode.extensions.getExtension("anthropic.claude-code")`.
  - Codex uses `vscode.extensions.getExtension("openai.chatgpt")`.
  - If exactly one supported provider is installed, launch it directly; if both are installed, show a provider picker; if neither is installed, show install/open-extension options.
- Launch Claude Code sessions through its documented VS Code URI.
  - Use `vscode.env.openExternal(vscode.Uri.parse("vscode://anthropic.claude-code/open?prompt=<encoded>"))`.
  - Include phase, spec id/title, spec path, and the one-line Sundial instruction in the prefilled prompt.
  - Do not auto-submit.
- Launch Codex sessions through the most stable available extension entry points.
  - For implementation, use `vscode.commands.executeCommand("chatgpt.implementTodo", { fileName, line, comment })`.
  - Encode `fileName` as `encodeURIComponent(specUri.fsPath)`.
  - For planning and review, copy the generated prompt to the clipboard and open `chatgpt.newCodexPanel` instead of using the implementation-framed todo transport.
  - Prefix Codex planning prompts with `/plan Planning only.` and Codex review prompts with `/review Review only.`; implementation prompts remain ordinary implementation task prompts.
  - Do not pass prompt text into `chatgpt.newCodexPanel`, `chatgpt.newChat`, or a Codex URI unless a future public contract documents prompt-prefill support.
- Put phase behavior in managed instructions and skills.
  - Planning uses `decision-aware-design`.
  - Implementation uses `decision-aware-implement`.
  - Review uses `decision-aware-review`.
  - Preserve baseline managed instructions alongside provider-specific skill templates so launched sessions still receive Sundial behavior when plugin loading is unavailable.
- Keep workflow boundaries intact.
  - Launch actions may read spec metadata and open provider sessions.
  - Spec creation, status changes, archival, deletion, and other durable workflow mutations remain CLI-owned.
  - Do not add `sundial spec plan|implement|review` CLI subcommands for the first implementation.
  - Do not write launch-only comments, TODOs, or transient instructions into spec markdown solely to trigger provider behavior.

## Rejected Alternatives

- Adding top-level `plan`, `implement`, and `review` CLI commands. Rejected because recurring stewardship workflows should stay under compact command families.
- Adding `sundial spec plan|implement|review` for the first implementation. Rejected because the requested primary experience is native VS Code provider UI, not terminal launch automation.
- Hand-editing spec files to mutate workflow state from launched sessions. Rejected because spec creation/status changes belong to the CLI-backed workflow; only authored spec body text should be edited directly.
- Building a terminal-first subprocess launcher as the primary experience. Rejected because the requested experience is the official VS Code extension UI.
- Assuming Codex has the same URI prompt-prefill contract as Claude. Rejected until official docs or a stable contributed command contract verifies it.
- Passing prompt text into Codex's contributed `chatgpt.newCodexPanel` or `chatgpt.newChat` commands. Rejected because RES-0001 found no documented prompt argument and static inspection of the installed handlers did not find prompt handling.
- Making Codex panel plus clipboard the only Codex launch path. Rejected because RES-0001 found a verified installed `chatgpt.implementTodo` command path that can carry implementation prompts into the Codex webview.
- Implementing layered Codex fallback behavior upfront. Rejected because phase-specific launch behavior should stay explicit instead of trying multiple undocumented transports after a launch action.
- Persisting temporary launch instructions in spec markdown as the primary Codex handoff. Rejected because direct `implementTodo` command arguments can provide the instruction without adding launch-only churn to the spec body.
- Building large phase-specific prompts in the VS Code extension. Rejected because the extension should hand off a one-line command and keep detailed behavior in Sundial skills and managed instructions.
- Auto-submitting prompts into provider extensions. Rejected because Claude's documented URI only pre-fills, and keeping the user in the loop is safer for plan/implement/review actions.

## Test Plan

- Add VS Code unit coverage for one-line phase command generation from a spec record.
- Add VS Code unit coverage that Codex planning prompts start with `/plan`, Codex review prompts start with `/review`, and implementation prompts do not add an unsupported slash command.
- Add VS Code unit coverage for Claude URI construction, including URL encoding and phase/spec metadata.
- Add VS Code unit coverage for provider availability detection and missing-extension messaging.
- Add Specs webview unit coverage for row-local `Plan`, `Implement`, and `Review` actions.
- Add typed message guard coverage for launch requests from the Specs webview to the extension host.
- Add extension-host coverage that launch requests dispatch to the selected provider launcher.
- Add Codex launcher coverage that implementation launches call `chatgpt.implementTodo` with encoded `fileName`, section `line`, and generated one-line `comment`.
- Add Codex launcher coverage that planning and review launches copy an explicit phase prompt to the clipboard and open `chatgpt.newCodexPanel`.
- Manually smoke test Codex launch behavior for all three phases: planning and review should arrive as explicit non-implementation prompts, while implementation should use the `implementTodo` handoff.
- Add template/store coverage for any skill or managed-instruction updates that make phase behavior available to Codex, Claude, and generic harness installs.
- Add package manifest coverage for any new Sundial commands or menu contributions while preserving Command Palette access.
- Add VS Code integration coverage around Sundial's own command/message flow where practical, but do not assert undocumented Codex URI or `newChat` prompt-prefill behavior in automated tests.
- Run targeted VS Code unit coverage during implementation: `npm --workspace packages/vscode run test:unit`.
- Because this is a major feature, run the broad local regression set before finalizing:
  - `npm run check-types`
  - `npm run lint`
  - `npm run test:unit`
  - `npm test`

## Open Questions

- Should implementation launches move a spec to `Active`, or should status remain an explicit separate workflow action?
- Should provider launch actions live only on spec rows, or should the opened spec preview/board card also expose them?
- Should Sundial remember a preferred provider per workspace after the first successful launch, or keep provider choice stateless?

## Implementation Log

- 2026-07-07: Planned SPEC-0004 around CLI-owned spec phase launchers for Claude and Codex.
- 2026-07-07: Revised plan to launch sessions through the official Codex and Claude Code VS Code extensions, with Claude using its documented URI prompt-prefill handler and Codex requiring a command/URI contract spike.
- 2026-07-07: Updated Codex launch plan from spike-first to `chatgpt.newCodexPanel` plus clipboard prompt handoff based on RES-0001 findings.
- 2026-07-07: Made launch behavior decisive after RES-0001: Claude uses documented prefill, Codex uses official panel/sidebar command plus clipboard handoff, and Codex prompt-prefill is not part of this implementation.
- 2026-07-07: Added Codex `chatgpt.implementTodo` as the preferred Codex handoff after local inspection found it accepts `{ fileName, line, comment }`, while retaining panel/clipboard fallback because the argument shape is not publicly documented.
- 2026-07-07: Simplified launch design so Claude receives a one-line prompt, Codex uses `implementTodo` with a one-line comment, and detailed phase behavior lives in Sundial skills/managed instructions instead of VS Code-generated prompt bodies.
- 2026-07-07: Added explicit skill/managed-instruction work to support the one-line launch commands across Codex, Claude, and generic harness installs.
- 2026-07-08: Reorganized the plan into implementation slices: shared launch contract, Specs UI entry points, provider selection, provider transports, skills/instructions, workflow boundaries, and verification sequence.
- 2026-07-08: Tightened adjacent discovery, DR, rejected-alternative, and test-plan sections so the spec consistently points at a VS Code-first launch workflow.
- 2026-07-12: Implemented provider-neutral spec session helpers, VS Code command-palette phase commands, and row-local `Plan`, `Implement`, and `Review` actions in the Specs sidebar and board.
- 2026-07-12: Wired Claude launches through `vscode://anthropic.claude-code/open?prompt=...` and Codex implementation launches through `chatgpt.implementTodo` with encoded `fileName`, section line, and phase-specific one-line comment.
- 2026-07-12: Added `decision-aware-review` skill templates plus managed-instruction phase guidance; planning uses `decision-aware-design`, implementation uses `decision-aware-implement`, and review uses `decision-aware-review`.
- 2026-07-12: Fixed the local CLI build to preserve executable permissions on `packages/cli/dist/main.js`, which VS Code integration scenarios spawn directly.
- 2026-07-12: Adjusted Codex planning and review launches to avoid the implementation-framed `implementTodo` transport; non-implementation Codex phases now open the Codex panel and copy an explicit `/plan` or `/review` prompt, while implementation still uses `implementTodo`.

## Test Log

- 2026-07-12: `npm run check-types` passed.
- 2026-07-12: `npm run lint` passed.
- 2026-07-12: `npm run test:unit` passed after restoring markdown preview metadata table padding to the existing test contract.
- 2026-07-12: `npm test` passed. The first sandboxed run could not resolve `update.code.visualstudio.com`; reran with approved network access so `vscode-test` could download/use VS Code Insiders.
- 2026-07-12: Follow-up Codex planning prompt fix verified with `npm run check-types`, `npm run lint`, `npm --workspace packages/vscode run test:unit`, `npm run test:unit`, and `npm test`.
