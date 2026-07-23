---
id: SPEC-0011
title: Sundial spec cards can navigate to active worktrees or main
status: Backlog
created: 2026-07-22
updated: 2026-07-23
created_by: bjackson
---

# Sundial spec cards can navigate to active worktrees or main

## Discovery

The shipped `arcridge.sundial` 0.4.2 extension has a first-generation worktree launcher in `packages/vscode/src/specWorktrees.ts`. It runs Git in the extension host, prompts for an editable branch name, creates a sibling checkout, disables creation from every linked worktree, and identifies an active spec only when the current folder name begins with that spec ID. It cannot show that a spec has an associated worktree in another window, return to the primary worktree, or finish a spec branch.

The governing ownership split is:

- `sundial` CLI owns specs, decisions, research, managed spec-worktree topology, creation, finishing, and Git safety.
- The Sundial VS Code extension owns card presentation, user prompts, clipboard handoff, progress, and `vscode.openFolder` navigation. It does not reproduce CLI mutations.

The installed context verified on 2026-07-23 is:

- `arcridge.sundial` 0.4.2 and `@arcridge/sundial` 0.4.0;
- the existing worktree launcher is extension-host logic and the Sundial CLI has no worktree command family yet.

Generated worktrees should live below the already trusted primary checkout at:

`<primary-worktree>/.sundial-worktrees/<spec-file-basename>`

VS Code inherits trust from the trusted parent. Before creating the directory, the Sundial CLI idempotently adds `.sundial-worktrees/` to the common repository's `.git/info/exclude`, preserving existing content and avoiding a tracked ignore rule.

The spec filename without `.md` is the managed identity for both the worktree directory and default branch. The UI never prompts to rename it. Association uses an exact worktree-path basename match, not the current loose `SPEC-####` prefix match.

For each spec, one CLI topology query reports:

- `none`: no exact associated worktree and no blocking branch/path collision;
- `associatedElsewhere`: one exact associated worktree exists outside the active workspace;
- `associatedActive`: that exact worktree is the active workspace;
- `error`: topology is ambiguous or unsafe, including duplicate basename matches, an exact branch checked out at a differently named path, detached or malformed managed topology, or Git inspection failure.

An error card is informational in this scope and does not attempt general repair. A rebase conflict created by the finish workflow is a known resumable finish state, not an ambiguous topology repair.

Card actions are:

- `none`: create worktree;
- `associatedElsewhere`: open the associated worktree; when the active workspace is the primary worktree, also offer Finish Worktree;
- `associatedActive`: return to the primary worktree in the current window;
- `error`: show the CLI diagnostic with no mutating action.

Card states use only VS Code theme tokens: neutral for none, a token-derived blue treatment for elsewhere, a token-derived green treatment for active, and a token-derived conflict/orange treatment for error. Icon-only actions retain accessible labels, keyboard focus, and tooltips.

Finishing from the primary worktree performs this guarded sequence:

1. Reinspect topology and acquire a common-repository worktree-operation lock so two windows cannot mutate the same managed worktree concurrently.
2. Refuse unrelated Git operations, detached managed branches, published `Sundial:temp` commits, an untracked target spec, or changed topology. If the feature worktree is already stopped in the same rebase with unresolved conflicts, return the structured conflict result again instead of starting another mutation. Temporary stacks remain Sundial Editor workflow state and must be consolidated there before finishing; the Sundial CLI does not rewrite them.
3. If the primary worktree is dirty, prompt for a non-empty commit message and have the CLI stage and commit all changes.
4. If the feature worktree is dirty, read an optional non-empty `## Proposed Commit Message` section from the feature copy of the spec. Use it when present; otherwise prompt. The CLI then stages and commits all feature-worktree changes.
5. Rebase the feature branch onto the current primary branch. If the primary branch changes concurrently, stop and require a fresh rebase rather than merging stale work.
6. If the rebase conflicts, leave the recoverable rebase in progress and return a structured conflict result containing the managed worktree path, branches, and conflicted files. The extension shows a message with a **Copy Prompt** action. That action copies a bounded prompt instructing an LLM to work only in the managed worktree, resolve every current conflict, stage the resolutions, and run `git rebase --continue` until the rebase is complete. The finish command exits without merging or removing anything.
7. After a successful rebase, merge with `--ff-only` in the primary worktree, verify the feature tip is reachable from the primary branch, and remove the linked worktree directory through `git worktree remove`. Retain the local feature branch in this scope.

After the user gives the copied prompt to an LLM and that LLM completes the rebase, clicking Finish Worktree again safely reruns the same sequence. The primary and feature worktrees are then clean, their commits already exist, and rebasing the feature branch onto the unchanged primary branch is a no-op. No persisted finish transaction, task handle, polling loop, or separate resume command is required.


## Applicable Decision Records

- DR-0003 through DR-0009 govern Lit, the host/webview split, CSP, accessibility, token-only styling, typed messages, and `WebviewView`.
- DR-0010 keeps spec actions row-local while commit-message prompts remain modal.
- DR-0012 keeps worktree lifecycle mutations in the owning `sundial` CLI rather than the extension host.
- DR-0014 separates integration-harness failures from installed behavior.
- DR-0016 permits structured Git subprocesses as an external adapter while keeping CLI store behavior dependency-light.
- DR-0017 and DR-0032 govern staged workspaces and the verified project-managed VS Code test runtime.
- DR-0019 preserves the existing Command Palette worktree entry point while card actions change.
- DR-0025 requires CLI version and lockfile review for the new public worktree commands.
- Sundial Editor DR-0039 requires the finish preflight to reject published temporary commits rather than rewriting or merging them.

## Applicable Research Notes

- RES-0003 records the stable `vscode.openFolder` command surface.
- RES-0004 and RES-0005 record the rejected Git worktree extension command contracts; implementation does not depend on either extension.
- RES-0007 records the stable VS Code Workspace Trust surface, parent-folder inheritance, and the nested-worktree Git probe.

## Planned Approach

### 1. Add CLI-owned managed-worktree commands

- Add a focused CLI core module for Git topology parsing, exact spec association, common-dir exclusion, creation, finish preflight, and finish.
- Expose a compact `sundial worktree` command family with machine-readable results. It supports one bulk topology query per Sundial store, create by resolved spec ID, finish preflight, and finish.
- Return versioned discriminated JSON results rather than requiring the extension to parse human output. Human invocations still receive concise diagnostics.
- Resolve specs through the canonical CLI store and validate the target file is tracked at the primary `HEAD` before creation.
- Invoke Git only with argument arrays. Bound stdout/stderr, validate every resolved path is within the discovered common repository, and serialize mutations with a common-repository lock.
- Parse `git worktree list --porcelain` once per topology request. Use canonical paths and exact spec-file basenames; never infer association from title text or an ID prefix.

### 2. Make creation deterministic and trusted

- Discover the primary worktree even when the command is invoked from a linked worktree.
- Derive the worktree path and branch from the exact spec-file basename with no rename prompt.
- Add `.sundial-worktrees/` idempotently to the common `.git/info/exclude` before creating the directory.
- Create from the primary worktree's current `HEAD`. If the exact local branch already exists and is not checked out elsewhere, attach it without resetting it; report unsafe collisions as `error`.
- Return the created path to the extension, which opens it with `vscode.openFolder`.

### 3. Replace boolean UI flags with a typed state model

- Replace `worktreeSpawnDisabled` and `activeWorktree` with a discriminated card state carrying the associated path and diagnostic only when appropriate.
- Extend both specs-sidebar and specs-board host/client unions, runtime guards, exhaustive dispatch, diagnostics, and tests.
- Render create, open, return, finish, and error-details actions from the state matrix in Discovery.
- Use Codicons such as `repo-forked`, `arrow-right`, `arrow-left`, and `git-merge`; all state styling derives from `--vscode-*` tokens or `color-mix()` over them.
- Preserve `sundial.specs.spawnWorktree` in the Command Palette, but route it through the deterministic CLI create operation.

### 4. Add navigation and refresh behavior

- Use the CLI-returned primary and associated paths; never reconstruct them in the webview.
- Open an associated worktree in a new window. Return from an active worktree by reopening the primary folder in the current window.
- Refresh the sidebar and board after every operation, when their surface becomes visible, and when the window regains focus so external worktree changes do not leave stale cards.

### 5. Implement guarded finish orchestration

- Add a Finish Worktree message/command available only for `associatedElsewhere` while the active workspace is primary.
- Save the active primary workspace's documents, run CLI preflight, then collect only the commit messages preflight requests.
- Let the CLI revalidate all preflight assumptions before each mutation, create any required commits, rebase, fast-forward merge, and remove the worktree.
- Represent `completed`, `conflicts`, `stale`, `blocked`, and `failed` explicitly. A conflict result contains only the trusted facts needed to explain recovery and build the copyable prompt.
- Do not delete the retained feature branch, use force flags, auto-abort conflicts, or attempt general repair of ambiguous topology.

### 6. Add the copyable rebase-recovery prompt

- Have the CLI return the canonical worktree path, primary branch, feature branch, and normalized conflict paths when `git rebase` stops on conflicts.
- Return the same conflict result when Finish is clicked while that managed rebase is still unresolved; reject unrelated in-progress Git operations.
- Format one deterministic, bounded prompt from that trusted result. It directs the LLM to inspect `git status`, operate only in the named worktree, resolve and stage all conflicts, repeatedly run `git rebase --continue` until no rebase remains, and leave merging/removal to Sundial.
- Offer **Copy Prompt** through the VS Code message action and write it with `vscode.env.clipboard.writeText`.
- End the current finish attempt immediately after copying or dismissing the message. The user explicitly starts a fresh attempt by clicking Finish Worktree after the LLM completes the rebase.
- On the fresh attempt, rerun ordinary topology and Git safety checks. Do not store recovery state or trust the prompt recipient's claim of success.

### 7. Versioning and delivery

- Bump `@arcridge/sundial` from 0.4.0 to 0.5.0 and `arcridge.sundial` from 0.4.2 to 0.5.0, with matching lockfile updates, because both packages add public functionality.
- No Sundial Editor package or command changes are required.

## Rejected Alternatives

- Put worktree commands in `sundial-editor-cli`: rejected because that CLI owns agents and agent work; the main Sundial CLI owns specs and managed worktrees.
- Keep Git orchestration in the VS Code extension host: rejected because it would duplicate CLI business rules and make terminal/other adapters disagree.
- Delegate to installed Git Worktrees or Git Worktree Manager extensions: rejected because neither exposes a stable deterministic argument-bearing creation/finish API.
- Continue matching only the `SPEC-####` prefix: rejected because renamed or duplicate paths can be misidentified and cannot support deterministic navigation.
- Let users edit the managed worktree or branch name: rejected because exact filename-derived identity is the association contract.
- Store worktrees beside the repository: rejected because each sibling folder requires separate trust and is outside the trusted parent.
- Add `.sundial-worktrees/` to tracked `.gitignore`: rejected because the container is machine-local workflow state; common `.git/info/exclude` avoids repository churn.
- Automatically rewrite or consolidate Sundial Editor temporary commits: rejected because temporary-stack safety belongs to the editor workflow, and published temporary commits must not be rewritten.
- Submit and poll editor-managed agent work: rejected because a copyable recovery prompt provides the required handoff without a second CLI, task identity, queue readiness, polling, or cross-extension lifecycle.
- Persist a finish transaction or add a separate resume command: rejected because rerunning the guarded finish sequence after a completed rebase naturally skips clean commits and an already-current rebase.

## Test Plan

- CLI unit tests:
  - parse porcelain output for primary, linked, detached, locked, prunable, malformed, and duplicate-basename worktrees;
  - classify all four card states from exact spec basenames;
  - find the primary worktree from both primary and linked invocation roots;
  - preserve existing `.git/info/exclude` bytes while adding exactly one exclusion;
  - reject untracked specs, unsafe paths, branch/path collisions, detached branches, unrelated in-progress operations, and published `Sundial:temp` commits;
  - recognize an unresolved managed rebase and return the same structured conflict result without mutating it;
  - create from primary `HEAD`, attach an existing safe branch, and avoid editable names;
  - preflight commit-message needs and parse an optional `## Proposed Commit Message`;
  - commit dirty primary/feature worktrees in order, rebase, fast-forward merge, remove the worktree, and retain the branch;
  - return normalized structured conflicts, reject stale primary revisions, and finish idempotently on a fresh invocation after an externally completed rebase.
- VS Code unit tests:
  - parse versioned CLI results and surface typed failures;
  - validate the new host/webview state and action unions;
  - render the action/state matrix in both sidebar and board with accessible labels and token-only colors;
  - route create/open/return/finish actions to the shared host controller;
  - format and copy a bounded conflict prompt containing the exact trusted worktree/branch/conflict data;
  - verify dismissing or copying the prompt ends the finish attempt without merge or removal;
  - preserve Command Palette access and verify both package versions.
- Staged integration scenarios:
  - create a nested worktree and verify the primary checkout stays clean;
  - render none, elsewhere, active, and error states from real Git topology;
  - open elsewhere and return to primary with the correct URIs/window modes;
  - finish clean and dirty worktrees through a fast-forward merge;
  - stop on a real rebase conflict, verify the copied prompt, complete the rebase externally, click Finish again, and verify the second pass merges/removes without duplicate commits.
- Manual smoke tests:
  - verify inherited Workspace Trust under a trusted primary folder;
  - verify light, dark, high-contrast, and high-contrast-light state treatments;
  - verify behavior when the associated worktree is open in another VS Code window.
- Run the broad regression set: `npm run check-types`, `npm run lint`, `npm run test:unit`, and elevated `npm test`.

## Open Questions

- VS Code's stable extension API cannot directly close a different window's extension host. Should Finish Worktree remove the folder and warn the user to close the stale worktree window, or should a finish action also be offered inside the active worktree so that window can return to primary before cleanup? The latter is the recommended follow-up if automatic window closure is required.
- Should a successfully merged managed feature branch be deleted? This plan retains it because the requested destructive cleanup names only the worktree folder; a later explicit policy can safely add branch deletion.

## Implementation Log

- 2026-07-23: Planned deterministic nested worktrees, CLI-owned topology/finish behavior, four typed card states, and optional editor-owned agent conflict recovery.
- 2026-07-23: Corrected the ownership boundary: the main `sundial` CLI owns worktrees; `sundial-editor-cli` owns agents and agent work.
- 2026-07-23: Verified that the installed editor tools contain interactive task commands but not the generic background task submit/status contract, so capability detection and manual fallback are required.
- 2026-07-23: Proposed CAND-0003 to preserve the cross-product CLI ownership boundary.
- 2026-07-23: Reduced conflict recovery to a copyable LLM prompt plus a fresh Finish invocation; removed agent selection, task submission/status polling, persisted recovery state, and a separate resume command from scope.

## Test Log
