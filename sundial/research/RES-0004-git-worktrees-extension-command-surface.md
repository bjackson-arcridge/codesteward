---
id: RES-0004
title: Git Worktrees extension command surface
domain: vscode.extension
summary: The installed Git Worktrees VS Code extension exposes interactive worktree commands but no stable argument-bearing add-worktree API. Load this when considering whether Sundial can delegate worktree creation to that extension.
created: 2026-07-08
updated: 2026-07-08
---

## Research

Verified locally on 2026-07-08 against installed extension `gitworktrees.git-worktrees` version `2.16.0` at `/Users/bjackson/.vscode/extensions/gitworktrees.git-worktrees-2.16.0`.

Package manifest facts:

- Extension id: `gitworktrees.git-worktrees`.
- Contributed commands: `git-worktrees.worktree.list`, `git-worktrees.worktree.remove`, `git-worktrees.worktree.add`, and `git-worktrees.worktree.toggleLogs`.
- `vsCodeGitWorktrees.move.openNewVscodeWindow` defaults to `true`.
- `vsCodeGitWorktrees.worktrees.dir.path` can choose a shared worktrees directory.
- Copy helpers are configured through `vsCodeGitWorktrees.worktreeCopyIncludePatterns` and `vsCodeGitWorktrees.worktreeCopyExcludePatterns`.

Compiled command-handler facts from `out/extension.js`:

- `git-worktrees.worktree.add` registers an async command with no arguments and calls the extension's add workflow directly.
- The add workflow prompts for workspace, remote branch, and optional new branch through VS Code UI helpers.

Compiled helper facts from `out/helpers/gitWorktreeHelpers.js`:

- The extension's internal helpers can calculate a new worktree path, run `git worktree add`, copy configured files, and call `vscode.openFolder`.
- Those helpers are CommonJS internals under the installed extension directory, not an exposed VS Code extension API or declared dependency surface.

Sources:

- `/Users/bjackson/.vscode/extensions/gitworktrees.git-worktrees-2.16.0/package.json`
- `/Users/bjackson/.vscode/extensions/gitworktrees.git-worktrees-2.16.0/out/extension.js`
- `/Users/bjackson/.vscode/extensions/gitworktrees.git-worktrees-2.16.0/out/git/operations/worktree/gitWorktreeAdd.js`
- `/Users/bjackson/.vscode/extensions/gitworktrees.git-worktrees-2.16.0/out/helpers/gitWorktreeHelpers.js`
