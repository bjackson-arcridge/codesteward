---
id: SPEC-0004
title: Helper functions to launch claude or codex sessions
status: Backlog
created: 2026-07-07
updated: 2026-07-07
created_by: bjackson
---

# Helper functions to launch claude or codex sessions 

## Discovery
(3) functions: planning, implemenation, and review.

Should launch a session indicating the specification, and the step we are in (planning / implementation / review).

Planning should avoid implemenation, but may write and run code to test assumptions / validate the implementation plan.

Review should audit implementation for completeness, testing done and ensure testing and security standards.

These sessions should launch inside the official VS Code extensions for Codex and Claude Code so users get the provider's native chat/review UI instead of a raw subprocess stream.

Claude Code's VS Code extension documents a URI handler, `vscode://anthropic.claude-code/open?prompt=...`, that opens a Claude Code tab with a prefilled prompt. The prompt is not automatically submitted.

Codex's VS Code extension documents command IDs including `chatgpt.implementTodo`, `chatgpt.newChat`, `chatgpt.newCodexPanel`, and `chatgpt.openSidebar`, plus IDE slash commands such as `/plan` and `/review`. Public Codex docs do not document a prompt-prefill URI equivalent to Claude's handler, and static inspection of the installed extension did not find prompt handling in the contributed `newCodexPanel`, `newChat`, or URI handlers. Static inspection did find an `implementTodo` command path that hands `{ fileName, line, comment }` to the Codex webview as an `implement-todo` message.

Provider plugins are customization/capability packaging surfaces, not the primary session-launch mechanism. The launch path should use official VS Code extension commands or URI handlers; Sundial-managed skills/plugins can still provide context once the provider session starts.

The launch prompt should be intentionally small: one line that names the phase, points at the spec, and tells the provider to use the relevant Sundial skill/instructions. The detailed behavior for planning, implementation, and review belongs in skills and managed agent instructions rather than in a large prompt assembled by the VS Code extension.


## Applicable Decision Records

- DR-0001 Codex bootstrap uses full-auto sandbox.
- DR-0002 Bootstrap streams subprocess output.
- DR-0012 Sundial workflows live in the CLI-backed store.
- DR-0016 CLI store operations avoid runtime dependencies and shell pipelines.
- DR-0020 Stewardship commands use compact top-level nouns.
- DR-0022 Managed agent instructions remain baseline alongside plugins.
- DR-0023 Agent harness installs use staged harness modules.
- DR-0025 CLI surface changes require version review.
- DR-0003 Webview UI uses Lit and `@floating-ui/dom` if this gains a VS Code webview entry point.
- DR-0004 Webview file layout follows the apps/providers split if this gains a VS Code webview entry point.
- DR-0005 Webviews enforce a strict nonce-based CSP if this gains a VS Code webview entry point.
- DR-0006 Webview UI meets baseline accessibility requirements if this gains a VS Code webview entry point.
- DR-0007 Webview styling uses only `--vscode-*` design tokens if this gains a VS Code webview entry point.
- DR-0008 Extension <-> webview messages use typed discriminated unions if this gains a VS Code webview entry point.
- DR-0009 Sidebar sections use WebviewView, not TreeView, if this gains a sidebar entry point.
- DR-0010 VS Code per-item actions stay localized to the row if this gains row-level launch actions.
- DR-0019 Preserve Command Palette Access When Removing Local UI Entry Points if command/menu entries are adjusted.
- DR-0026 VS Code scenarios compile local CLI dist if integration tests exercise new CLI commands from VS Code.

## Applicable Research Notes

- RES-0001 VS Code provider session launch surfaces.

## Planned Approach

- Build the first user-facing launch surface in the Sundial VS Code Specs UI:
  - Add row-local actions for `Plan`, `Implement`, and `Review` on each spec row, following the Specs sidebar/board patterns.
  - Each action opens a small provider choice only when both official provider extensions are installed; if exactly one provider is installed, launch that provider directly.
  - If no supported provider extension is installed, show a concise notification with provider install/open options instead of exposing a dead action.
  - Keep any additional Command Palette commands available for keyboard-driven use.
- Add a provider-launch abstraction in the VS Code extension host:
  - Represent supported providers as `claude` and `codex`.
  - Represent session phases as `planning`, `implementation`, and `review`.
  - Generate a one-line phase command from the selected spec id, title, file path, and phase.
  - The one-line command should tell the provider to use the relevant Sundial planning, implementation, or review skill/instructions for that spec, not inline the full workflow.
  - Return a launch result that distinguishes `prefilled`, `codex-todo-handoff`, and `unavailable` outcomes so the webview can show accurate feedback.
  - Keep the provider-neutral command text short, then apply a provider-specific transport wrapper for Claude URI encoding or Codex todo handoff.
- Put the detailed phase behavior in Sundial skills and managed instructions:
  - Ensure the installed Codex, Claude, and generic skill/instruction templates include enough planning, implementation, and review guidance for the one-line launch command to work.
  - Keep provider-specific launch mechanics out of those skill instructions except where a provider needs to understand how to interpret the one-line command.
  - Preserve baseline managed instructions alongside any provider plugin packaging so the flow still works when plugin loading is unavailable.
- Launch Claude Code sessions through its documented official VS Code URI:
  - Use `vscode.env.openExternal(vscode.Uri.parse("vscode://anthropic.claude-code/open?prompt=<encoded>"))`.
  - Include the phase, spec id/title, spec path, and instruction to use the relevant Sundial skill/instructions in the prefilled prompt.
  - Do not auto-submit; let the user review and send the prompt in Claude's native UI.
- Launch Codex sessions through the most stable official VS Code extension entry point available:
  - Use `vscode.commands.executeCommand("chatgpt.implementTodo", { fileName, line, comment })` for Codex launches.
  - Use the selected spec markdown file as the `fileName` anchor, pass the best available line number for the relevant spec section, and pass the generated phase prompt as `comment`.
  - Encode `fileName` the same way Codex's installed CodeLens provider does: `encodeURIComponent(specUri.fsPath)`.
  - Prefix Codex planning comments with `/plan` and Codex review comments with `/review`; implementation comments should remain ordinary implementation task prompts.
  - Do not write launch-only instructions into the spec markdown solely to trigger Codex unless direct command arguments prove unreliable in a manual smoke test.
  - Do not attempt to pass prompt text into `chatgpt.newCodexPanel`, `chatgpt.newChat`, or a Codex URI unless a future public contract documents prompt-prefill support.
  - Treat the `implementTodo` argument shape as a verified installed-extension behavior, not a formally documented public API; if it fails in practice, pivot the design after the smoke test rather than implementing fallback behavior upfront.
- Keep the CLI out of the primary user flow for this feature:
  - Do not add `sundial spec plan|implement|review` CLI subcommands unless a later automation use case needs terminal-first launches.
  - If a CLI fallback is added later, it should share prompt construction but remain secondary to the official VS Code extension flow.
- Keep each phase command minimal:
  - Planning command shape: `Use the Sundial planning skill/instructions to plan SPEC-0004 at <path>.`
  - Implementation command shape: `Use the Sundial implementation skill/instructions to implement SPEC-0004 at <path>.`
  - Review command shape: `Use the Sundial review skill/instructions to review SPEC-0004 at <path>.`
  - Skills and managed instructions own details such as consulting DRs/research, avoiding implementation during planning, updating the spec, running tests, and producing review findings before summary.
  - For Codex, include `/plan` before the planning one-liner and `/review` before the review one-liner because official docs list those IDE slash commands.
  - For Claude, rely on the one-line prompt plus skills/instructions rather than attempting to select `claudeCode.initialPermissionMode`.
- Detect missing provider extensions before launch:
  - For Claude, check `vscode.extensions.getExtension("anthropic.claude-code")`.
  - For Codex, check `vscode.extensions.getExtension("openai.chatgpt")`.
  - Offer a concise install/open-marketplace path if the selected official extension is unavailable.
- Keep Sundial workflow mutations CLI-owned:
  - The VS Code action may read spec data and build prompts.
  - Status changes, spec creation, archival, or other durable workflow mutations should still delegate to existing CLI commands.

## Rejected Alternatives

- Adding top-level `plan`, `implement`, and `review` commands. Rejected because these are spec workflow actions and should stay under the compact `spec` command family.
- Hand-editing spec files to mutate workflow state from launched sessions. Rejected because spec creation/status changes belong to the CLI-backed workflow; only authored spec body text should be edited directly.
- Buffering the launched agent output until exit. Rejected because these sessions can be long-running and should use the same streaming posture as bootstrap.
- Building a terminal-first subprocess launcher as the primary experience. Rejected because the requested experience is the official VS Code extension UI.
- Assuming Codex has the same URI prompt-prefill contract as Claude. Rejected until official docs or a stable contributed command contract verifies it.
- Passing prompt text into Codex's contributed `chatgpt.newCodexPanel` or `chatgpt.newChat` commands. Rejected because RES-0001 found no documented prompt argument and static inspection of the installed handlers did not find prompt handling.
- Making Codex panel plus clipboard the only Codex launch path. Rejected because RES-0001 found a verified installed `chatgpt.implementTodo` command path that can carry `{ fileName, line, comment }` into the Codex webview.
- Implementing a Codex panel/clipboard fallback upfront. Rejected for the initial implementation because `implementTodo` is the focused workaround to smoke test; if it fails, the design can pivot with fresh evidence.
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
- Add Codex launcher coverage that the launcher calls `chatgpt.implementTodo` with encoded `fileName`, section `line`, and generated one-line `comment`.
- Manually smoke test Codex `implementTodo` handoff for all three phases, especially planning and review, because the command is named and surfaced as implementation-oriented even though its verified argument payload can carry phase-specific instructions.
- Add template/store coverage for any skill or managed-instruction updates that make phase behavior available to Codex, Claude, and generic harness installs.
- Add package manifest coverage for any new Sundial commands or menu contributions while preserving Command Palette access.
- Add VS Code integration coverage around Sundial's own command/message flow where practical, but do not assert undocumented Codex URI or `newChat` prompt-prefill behavior in automated tests.

## Open Questions

- Should implementation launches move a spec to `Active`, or should status remain an explicit separate workflow action?
- Should provider launch actions live only on spec rows, or should the opened spec preview/board card also expose them?
- Should Sundial remember a preferred provider per workspace after the first successful launch, or keep provider choice stateless?
- Which concrete skill names should the one-line launch commands reference for planning, implementation, and review once the skill set is finalized?

## Implementation Log

- 2026-07-07: Planned SPEC-0004 around CLI-owned spec phase launchers for Claude and Codex.
- 2026-07-07: Revised plan to launch sessions through the official Codex and Claude Code VS Code extensions, with Claude using its documented URI prompt-prefill handler and Codex requiring a command/URI contract spike.
- 2026-07-07: Updated Codex launch plan from spike-first to `chatgpt.newCodexPanel` plus clipboard prompt handoff based on RES-0001 findings.
- 2026-07-07: Made launch behavior decisive after RES-0001: Claude uses documented prefill, Codex uses official panel/sidebar command plus clipboard handoff, and Codex prompt-prefill is not part of this implementation.
- 2026-07-07: Added Codex `chatgpt.implementTodo` as the preferred Codex handoff after local inspection found it accepts `{ fileName, line, comment }`, while retaining panel/clipboard fallback because the argument shape is not publicly documented.
- 2026-07-07: Simplified launch design so Claude receives a one-line prompt, Codex uses `implementTodo` with a one-line comment, and detailed phase behavior lives in Sundial skills/managed instructions instead of VS Code-generated prompt bodies.
- 2026-07-07: Added explicit skill/managed-instruction work to support the one-line launch commands across Codex, Claude, and generic harness installs.

## Test Log
