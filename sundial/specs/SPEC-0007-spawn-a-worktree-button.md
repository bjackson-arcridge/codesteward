---
id: SPEC-0007
title: Spawn a worktree button
status: Done
created: 2026-07-08
updated: 2026-07-09
created_by: bjackson
---
# Spawn a worktree button

Should create a git worktree and open a new vscode editor within that worktree.

## Discovery

The requested feature is a VS Code-first action on a spec: from a spec row/card, create a Git worktree for focused implementation work and open that worktree in a new VS Code window.

The feature should be owned by the Sundial VS Code extension rather than the Sundial CLI. DR-0012 keeps Sundial workflow and lifecycle mutations in the CLI-backed store, but creating a Git worktree is a repository operation, not a Sundial store lifecycle mutation.

The existing specs surfaces are:

- Specs sidebar: `RecordsWebviewProvider` with `actionMode: 'specs'`, rendered by `packages/vscode/src/webviews/apps/records/records-app.ts`.
- Specs board: `SpecsBoardPanel`, rendered by `packages/vscode/src/webviews/apps/specs/specs-board-app.ts`.
- Host command handling in `packages/vscode/src/extension.ts`, with helpers such as `specForCommand`, `specWorkspaceRootForCommand`, `collectSpecGroups`, and `collectSpecBoardState`.

The existing UI contract already uses typed discriminated-union messages between webviews and the extension host. The worktree action should follow that pattern by adding a `spawnWorktree` message to both specs surfaces and handling the actual Git operation in the extension host.

The installed Git Worktrees extension (`gitworktrees.git-worktrees` version `2.16.0`) was investigated as a possible dependency. It contributes `git-worktrees.worktree.add`, `git-worktrees.worktree.list`, `git-worktrees.worktree.remove`, and `git-worktrees.worktree.toggleLogs`, but the add command is an interactive no-argument command that opens its own workspace, branch, and input prompts. Its richer helper functions are compiled internals under the installed extension directory, not an exposed extension API. That makes the dependency a non-starter for a row-local Sundial action that needs deterministic spec context, branch/path defaults, test doubles, and direct error handling.

VS Code documents `vscode.openFolder` as the built-in command for opening a folder URI. The worktree implementation should create the worktree itself, then open the new worktree path with `vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(worktreePath), { forceNewWindow: true })`.

Initial workflow:

- Resolve the target spec and Sundial workspace from the row/card or Command Palette action.
- Resolve the spec source path and derive the worktree name from `path.basename(specPath, '.md')`, such as `SPEC-0007-spawn-a-worktree-button`.
- Resolve the Git top-level directory with `git rev-parse --show-toplevel`.
- Derive the default branch name from the same spec-file basename so branch and worktree naming stay aligned.
- Prompt the user with an input box prefilled with that branch name.
- Validate the branch with `git check-ref-format --branch <branch>`.
- Derive the worktree directory from the spec-file basename, defaulting to a sibling directory of the Git top-level such as `<parent>/SPEC-0007-spawn-a-worktree-button`.
- If the branch already exists locally, add the worktree for that branch with `git worktree add <path> <branch>`.
- If the branch does not exist locally, create it from the current `HEAD` with `git worktree add -b <branch> <path> HEAD`.
- Run Git through argument arrays, not shell-interpolated command strings.
- Wrap creation in `vscode.window.withProgress`.
- Open the resulting folder in a new VS Code window.

## Applicable Decision Records

- DR-0003 Webview UI uses Lit and `@floating-ui/dom`.
- DR-0004 Webview file layout follows the apps/providers split.
- DR-0005 Webviews enforce a strict nonce-based CSP.
- DR-0006 Webview UI meets baseline accessibility requirements.
- DR-0007 Webview styling uses only `--vscode-*` design tokens.
- DR-0008 Extension <-> webview messages use typed discriminated unions.
- DR-0009 Sidebar sections use WebviewView, not TreeView.
- DR-0010 VS Code per-item actions stay localized to the row, not in `showQuickPick`.
- DR-0012 Sundial workflows live in the CLI-backed store.
- DR-0014 Separate harness failures from product fixes if VS Code integration behavior disagrees with manual smoke tests.
- DR-0017 VS Code tests use staged scenario workspaces if integration coverage is added.
- DR-0019 Preserve Command Palette access when adding or changing command/menu entries.
- DR-0026 VS Code scenarios compile local CLI dist if integration tests exercise new CLI-backed behavior.
- DR-0027 Governance sidebars refresh on store file changes.

## Applicable Research Notes

- RES-0003 VS Code open folder command.
- RES-0004 Git Worktrees extension command surface.

## Planned Approach

Implement the worktree action as a Sundial-owned VS Code extension-host workflow with row-local UI entry points.

### 1. Shared worktree launcher module

- Add a focused extension-host module, for example `packages/vscode/src/specWorktrees.ts`.
- Keep the module small and dependency-injected enough for unit tests:
  - Git runner: `(cwd, args) => Promise<{ stdout: string; stderr: string }>` using `execFile`.
  - Open folder runner: `(path) => Promise<void>` using `vscode.openFolder`.
  - User input runner: VS Code input box for branch name.
- Define result types such as `created`, `openedExisting`, `cancelled`, and `failed` so callers can show accurate user feedback without parsing thrown errors.
- Export pure helpers for:
  - spec-file basename extraction from the resolved spec path;
  - default branch name from the spec-file basename;
  - default worktree path from repository root and spec-file basename;
  - parsing `git worktree list --porcelain` enough to detect whether a branch is already checked out in another worktree.

### 2. Git behavior

- Resolve the Git root from the selected Sundial workspace with `git rev-parse --show-toplevel`.
- Validate that `git` is available and that the workspace is inside a Git repository before prompting for branch details.
- Resolve the target spec markdown path and derive the worktree name from the filename without `.md`.
- Prompt for branch name with the same spec-file basename as the default value.
- Validate branch input with `git check-ref-format --branch <branch>`.
- Check for an existing local branch with `git show-ref --verify --quiet refs/heads/<branch>`.
- Check existing worktrees with `git worktree list --porcelain`; if the target branch is already attached to a worktree, offer to open that existing path instead of failing.
- Use the spec-file basename as the default worktree directory basename even if the user edits the branch name.
- Create a new branch worktree with:
  - `git worktree add -b <branch> <worktreePath> HEAD` when the branch does not exist.
  - `git worktree add <worktreePath> <branch>` when the branch exists but is not checked out in another worktree.
- Reject dangerous or ambiguous paths:
  - do not create inside `.git`;
  - do not create inside `sundial/`;
  - do not overwrite an existing directory;
  - do not shell-interpolate user input.
- Use `withProgress` while running `git worktree add`.
- Open the new or existing worktree with `vscode.openFolder` and `{ forceNewWindow: true }`.

### 3. Specs sidebar and board UI

- Add a row/card-local icon button labeled `Spawn worktree` to the specs sidebar and specs board.
- Add a shared icon entry in `cs-icon` for an appropriate codicon such as a branch/repo-fork symbol.
- Keep the action compact and localized to each spec row/card, matching DR-0010.
- Use `--vscode-*` tokens only; avoid new color literals.
- Maintain accessible labels and tooltip behavior for icon-only controls.
- Extend render diagnostics only if integration tests need to count the new action.

### 4. Typed webview messages

- Extend `packages/vscode/src/webviews/records/messages.ts` with a specs-mode message such as:
  - `{ kind: 'spawnSpecWorktree'; id: string; workspace?: string }`.
- Extend `packages/vscode/src/webviews/specs/messages.ts` with:
  - `{ kind: 'spawnWorktree'; id: string; workspace?: string }`.
- Update runtime guards and exhaustive host dispatch.
- Route both webview messages into the same extension-host launcher.

### 5. Commands and manifest

- Add a Command Palette command such as `sundial.specs.spawnWorktree`.
- Preserve the existing spec open/board commands and Command Palette availability.
- The command should prompt for a spec via `specForCommand` when no id is supplied.
- Do not add `extensionDependencies` for `gitworktrees.git-worktrees`.
- Do not add a CLI command for the first implementation.

### 6. User feedback and diagnostics

- Show a concise information message after creating/opening the worktree.
- Show actionable errors for:
  - no initialized Sundial workspace;
  - no Git repository;
  - invalid branch name;
  - target worktree path already exists;
  - branch already checked out in another worktree when the user declines opening it;
  - `git worktree add` failure.
- In integration-test mode, expose enough diagnostics or internal commands to trigger the action without relying on raw DOM clicks.

### 7. Implementation sequence

- Add pure branch/path/worktree-list helpers with unit tests.
- Add the extension-host launcher and tests with injected Git/open-folder/input doubles.
- Add typed messages and guard tests for both specs surfaces.
- Add UI buttons in specs sidebar and specs board, with source-level unit coverage matching existing webview tests.
- Add package manifest command contribution and manifest tests.
- Add integration coverage only around Sundial's command/message flow, using staged workspaces if practical.
- Manually smoke test creating a worktree from a real spec and verifying the new VS Code window opens at the expected worktree path.

## Rejected Alternatives

- Depending on `gitworktrees.git-worktrees`. Rejected because version `2.16.0` exposes only interactive no-argument commands for creating worktrees; its useful helpers are internal compiled files rather than a stable VS Code extension API.
- Calling `git-worktrees.worktree.add` from the row action. Rejected because it would lose the selected spec context, reopen an unrelated interactive flow, and make branch/path behavior hard to test.
- Importing internal files from the installed Git Worktrees extension directory. Rejected because installed extension paths and compiled internals are not a supported dependency surface.
- Adding a Sundial CLI command for worktree creation in the first implementation. Rejected because the requested workflow is a VS Code button, and Git worktree creation is not a Sundial store lifecycle mutation.
- Running `git worktree add` through a terminal as the main implementation. Rejected because the extension host needs structured errors, progress, test doubles, and a direct open-folder handoff.
- Building shell command strings from branch/path input. Rejected because the extension can use `execFile`/argument arrays and avoid shell quoting hazards.
- Creating worktrees inside the repository's `sundial/` directory or `.git` directory. Rejected because worktrees are separate checkouts, not Sundial store artifacts.

## Test Plan

- Unit test spec-file basename extraction from a resolved spec path.
- Unit test default branch-name generation from the spec-file basename.
- Unit test default worktree path generation from repository root and spec-file basename.
- Unit test `git worktree list --porcelain` parsing for no branch, local branch, detached worktree, and matching branch path.
- Unit test launcher behavior when branch input is cancelled.
- Unit test launcher behavior when `git rev-parse --show-toplevel` fails.
- Unit test launcher behavior when branch validation fails.
- Unit test launcher behavior for new branch creation: expects `git worktree add -b <branch> <path> HEAD`.
- Unit test launcher behavior for existing branch creation: expects `git worktree add <path> <branch>`.
- Unit test launcher behavior when branch is already attached to an existing worktree and the user chooses to open it.
- Unit test launcher behavior when target path already exists.
- Unit test `vscode.openFolder` handoff uses `Uri.file(worktreePath)` and `{ forceNewWindow: true }`.
- Add message guard tests for both specs sidebar and specs board worktree messages.
- Add webview source/unit coverage that specs sidebar and board render a row/card-local `Spawn worktree` action.
- Add package manifest coverage for `sundial.specs.spawnWorktree` while preserving existing spec commands.
- Add integration coverage with staged workspaces only if it can avoid brittle real-window assertions; otherwise keep integration coverage to command dispatch and rely on unit tests for Git/open-folder handoff.
- Manually smoke test on a real Git repository:
  - create from a spec row;
  - accept the default branch `SPEC-0007-spawn-a-worktree-button`;
  - verify `git worktree list` includes a path ending in `SPEC-0007-spawn-a-worktree-button`;
  - verify VS Code opens the new worktree in a new window;
  - verify an already-attached branch offers to open the existing worktree.
- Because this is a major feature, run the broad local regression set before finalizing:
  - `npm run check-types`
  - `npm run lint`
  - `npm run test:unit`
  - `npm test`

## Open Questions

- Should the first release include a configurable worktree parent directory, or is the sibling `<spec-file-basename>` default enough?
- If the user edits the branch name, should the worktree directory still use the spec-file basename or follow the edited branch?
- Should the launcher copy selected untracked files, such as local `.env` files, or leave that to a later explicit setting?

## Implementation Log

- 2026-07-08: Planned the feature as a Sundial-owned VS Code extension-host worktree launcher with row/card-local specs actions.
- 2026-07-08: Investigated depending on `gitworktrees.git-worktrees` and rejected it because its add command is interactive/no-argument and its helpers are not a stable API.
- 2026-07-08: Created RES-0003 for the `vscode.openFolder` command details.
- 2026-07-08: Created RES-0004 for the Git Worktrees extension command-surface findings.
- 2026-07-08: Kept the Git Worktrees extension rejection as spec-local rationale; it is not broad project guidance.
- 2026-07-08: Updated the naming plan so the worktree name comes from the spec source filename without `.md`; this remains spec-local guidance rather than a DR.
- 2026-07-08: Implemented `packages/vscode/src/specWorktrees.ts` with dependency-injected Git, prompt, progress, path-existence, and open-folder runners.
- 2026-07-08: Added specs sidebar, specs board, and Command Palette entry points that route to the shared extension-host worktree launcher.
- 2026-07-08: Extended records/specs webview message unions and diagnostics with guarded worktree actions.
- 2026-07-08: Aligned stale markdown preview unit expectations with the existing `0.25em` implementation so the full unit suite could verify this feature.
- 2026-07-09: Added acceptance-test refinement: linked Git worktrees disable spawn-worktree controls and host command execution refuses before prompting.
- 2026-07-09: Added active worktree highlighting when the current worktree root basename starts with a matching `SPEC-XXXX` prefix, rendering `SPEC-XXXX [Active Worktree]` in the spec metadata.

## Test Log

- 2026-07-08: `npm --workspace packages/vscode run check-types` passed.
- 2026-07-08: `npm --workspace packages/vscode run test:unit` passed after aligning stale markdown preview expectations.
- 2026-07-08: `npm run check-types` passed.
- 2026-07-08: `npm run lint` passed.
- 2026-07-08: `npm run test:unit` passed.
- 2026-07-08: Initial `npm test` hit sandboxed DNS resolution for `update.code.visualstudio.com`; reran with approved network access and the VS Code integration scenarios passed.
- 2026-07-09: `npm --workspace packages/vscode run check-types` passed.
- 2026-07-09: `npm --workspace packages/vscode run test:unit` passed.
- 2026-07-09: `npm run check-types` passed.
- 2026-07-09: `npm run lint` passed.
- 2026-07-09: `npm run test:unit` passed.
- 2026-07-09: `npm test` passed with approved network access after downloading the current VS Code Insiders test build.
