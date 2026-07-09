---
id: SPEC-0004
title: Helper functions to launch Claude or Codex sessions
status: Backlog
created: 2026-07-07
updated: 2026-07-08
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

Implement this as a VS Code-first spec launch feature. The extension adds phase actions to existing Specs surfaces, resolves the provider and phase in the extension host, then opens the selected provider's native VS Code UI with a minimal handoff. The feature must not mutate spec workflow state, create terminal-first CLI commands, or persist temporary launch text into spec markdown.

### 1. Shared launch contract

- Add a small extension-host launch module that owns the provider-neutral contract.
- Represent providers as `claude` and `codex`.
- Represent phases as `planning`, `implementation`, and `review`.
- Resolve each launch from a spec id/workspace to the spec title, markdown path, and best section line anchor.
- Generate one short phase prompt from the spec metadata:
  - Planning: `Use the Sundial decision-aware-design skill/instructions to plan SPEC-0004 at <path>.`
  - Implementation: `Use the Sundial decision-aware-implement skill/instructions to implement SPEC-0004 at <path>.`
  - Review: `Use Sundial review instructions and accepted Decision Records to review SPEC-0004 at <path>, with findings before summary.`
- Keep detailed behavior in skills and managed instructions: DR retrieval, research-note consultation, plan-only restraint, implementation logging, test expectations, and review finding format do not belong in VS Code-generated prompt bodies.
- Return a structured launch result such as `prefilled`, `codex-todo-handoff`, `unavailable`, or `failed` so callers can show accurate feedback without inspecting provider-specific exceptions.

### 2. Specs UI entry points

- Add row/card-local `Plan`, `Implement`, and `Review` actions to the existing Specs sidebar and Specs Board surfaces.
- Use the current webview architecture: Lit components, `--vscode-*` design tokens, accessible icon controls, and typed discriminated-union messages.
- Add a single webview-to-host launch message carrying `{ id, workspace, phase }`; let the extension host choose or confirm the provider.
- Preserve Command Palette access for keyboard-driven launches by adding commands that reuse the same host launcher.
- Do not add a separate launch panel, landing page, or custom provider UI.

### 3. Provider selection and availability

- Detect official provider extensions before launch:
  - Claude Code: `vscode.extensions.getExtension("anthropic.claude-code")`.
  - Codex: `vscode.extensions.getExtension("openai.chatgpt")`.
- If exactly one supported provider is installed, launch it directly.
- If both are installed, use a small `showQuickPick` provider choice; provider choice is a modal single-selection flow, not a per-item action.
- If none are installed, show a concise notification with install/open-marketplace options and do not dispatch a dead launch.
- Keep provider preference stateless for the first implementation; add workspace-level preference only after repeated use proves it worth storing.

### 4. Provider transports

- Launch Claude Code with its documented URI handler:
  - Build `vscode://anthropic.claude-code/open?prompt=<encoded>`.
  - Open it with `vscode.env.openExternal`.
  - Include phase, spec id/title, spec path, and the one-line Sundial instruction in the encoded prompt.
  - Do not auto-submit; Claude's documented behavior is prefill-only, and the user should review the prompt before sending.
- Launch Codex through the verified installed-extension `implementTodo` handoff:
  - Call `vscode.commands.executeCommand("chatgpt.implementTodo", { fileName, line, comment })`.
  - Use `encodeURIComponent(specUri.fsPath)` for `fileName`, matching Codex's installed CodeLens provider.
  - Use the best available line anchor for the relevant spec section.
  - Use the one-line prompt as `comment`.
  - Prefix Codex planning comments with `/plan` and review comments with `/review`; leave implementation as a normal task prompt.
- Treat Codex `implementTodo` arguments as verified installed-extension behavior, not a documented public prompt-prefill API.
- Do not pass prompt text into `chatgpt.newCodexPanel`, `chatgpt.newChat`, or a Codex URI unless future public documentation establishes that contract.
- Do not implement a Codex clipboard/panel fallback up front; run the manual smoke test first, then pivot only if the direct handoff fails.

### 5. Skills and managed instructions

- Keep provider launch mechanics in the VS Code extension, not in skills.
- Ensure the generic, Claude, and Codex managed instruction/skill templates can support the three phase prompts:
  - `decision-aware-design` covers planning.
  - `decision-aware-implement` covers implementation.
  - Review uses managed review instructions plus DR retrieval discipline unless a dedicated review skill is introduced.
- If template or generated runtime-asset changes are required, route them through the existing staged harness installer structure.
- Preserve baseline managed instructions alongside provider-specific skills/plugins so launched sessions still receive Sundial behavior when plugin loading is unavailable.
- Review CLI package version metadata if generated CLI-owned runtime assets change.

### 6. Workflow boundaries

- Keep spec lifecycle mutations CLI-owned: launch actions may read spec metadata and open provider sessions, but they must not create specs, change statuses, archive, delete, or otherwise mutate durable workflow state directly.
- Do not add `sundial spec plan`, `sundial spec implement`, or `sundial spec review` CLI subcommands for the first implementation.
- If a terminal-first launch workflow is needed later, reuse the same prompt-construction contract and keep it secondary to the official VS Code extension experience.
- Do not write launch-only comments, TODOs, or transient instructions into the spec markdown solely to trigger provider behavior.

### 7. Implementation sequence

- First, add the shared phase/provider prompt builder and unit tests.
- Next, add typed webview messages and row/card actions for Specs sidebar and Specs Board.
- Then, add provider detection, provider selection, and host launch dispatch.
- Implement Claude URI launch and Codex `implementTodo` launch behind the shared interface.
- Update managed instruction/skill templates only where the phase prompts expose a real gap.
- Run automated coverage, then manually smoke test all three phases for both providers before treating the feature as ready.

## Rejected Alternatives

- Adding top-level `plan`, `implement`, and `review` CLI commands. Rejected because recurring stewardship workflows should stay under compact command families.
- Adding `sundial spec plan|implement|review` for the first implementation. Rejected because the requested primary experience is native VS Code provider UI, not terminal launch automation.
- Hand-editing spec files to mutate workflow state from launched sessions. Rejected because spec creation/status changes belong to the CLI-backed workflow; only authored spec body text should be edited directly.
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
- Run targeted VS Code unit coverage during implementation: `npm --workspace packages/vscode run test:unit`.
- Because this is a major feature, run the broad local regression set before finalizing:
  - `npm run check-types`
  - `npm run lint`
  - `npm run test:unit`
  - `npm test`

## Open Questions

- Does the first manual Codex smoke test confirm that `chatgpt.implementTodo` works acceptably for planning and review prompts, despite the implementation-oriented command name?
- Does review need a dedicated `decision-aware-review` skill, or are managed review instructions plus accepted DR retrieval enough for the first release?

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

## Test Log
