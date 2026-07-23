---
id: RES-0007
title: VS Code workspace trust for generated worktrees
domain: vscode.extension
summary: VS Code's stable extension API can observe workspace trust but cannot grant trust to an arbitrary folder. Load this when choosing or opening generated worktree locations.
created: 2026-07-23
updated: 2026-07-23
---

## Research

Verified on 2026-07-23 against `@types/vscode` 1.109 and the current official VS Code Workspace Trust documentation:

- The stable `vscode.workspace` API exposes `isTrusted: boolean` and `onDidGrantWorkspaceTrust: Event<void>`.
- The stable API does not expose a method that grants trust to an arbitrary folder URI.
- `vscode.openFolder` opens a folder URI but has no documented workspace-trust option.
- VS Code inherits trust from a trusted parent folder to its subfolders.
- `security.workspace.trust.enabled` disables the Workspace Trust feature at application scope; it is not a per-folder trust grant.
- The `--disable-workspace-trust` command-line switch affects the current session rather than adding a folder to the user's trusted-folders list.

A local Git probe on 2026-07-23 also verified:

- `git worktree add <main>/.sundial-worktrees/SPEC-0022 ...` can create a linked worktree beneath the main worktree.
- Before exclusion, the main worktree reports `?? .sundial-worktrees/`.
- Adding `.sundial-worktrees/` to the common repository's `.git/info/exclude` removes that status entry without changing tracked repository files.

Sources:

- https://code.visualstudio.com/api/extension-guides/workspace-trust
- https://code.visualstudio.com/docs/editing/workspaces/workspace-trust
- https://code.visualstudio.com/api/references/commands
- `node_modules/@types/vscode/index.d.ts`
- Local disposable Git repository probe run on 2026-07-23
