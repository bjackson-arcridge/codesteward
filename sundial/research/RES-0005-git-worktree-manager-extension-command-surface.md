---
id: RES-0005
title: Git Worktree Manager extension command surface
domain: vscode.extension
summary: The installed Git Worktree Manager VS Code extension exposes rich interactive worktree commands and settings, but no stable deterministic add-worktree API. Load this when considering whether Sundial should depend on `jackiotyu.git-worktree-manager`.
created: 2026-07-09
updated: 2026-07-09
---

## Research

Verified locally on 2026-07-09 against installed extension `jackiotyu.git-worktree-manager` version `3.25.0` at `/Users/bjackson/.vscode/extensions/jackiotyu.git-worktree-manager-3.25.0`.

Package manifest facts:

- Extension id: `jackiotyu.git-worktree-manager`.
- Main entrypoint: `./dist/extension.js`.
- The manifest does not declare `extensionDependencies` or `extensionPack`.
- The activation export surface in the bundled entrypoint is only `activate` and `deactivate`; no public typed extension API or `.d.ts` file is shipped.
- Worktree creation commands contributed by the manifest include `git-worktree-manager.addWorktree` and `git-worktree-manager.addWorktreeFromBranch`.
- Relevant configuration keys include `git-worktree-manager.worktreePathTemplate`, `git-worktree-manager.worktreeSubdirectoryTemplate`, `git-worktree-manager.worktreeCopyPatterns`, `git-worktree-manager.worktreeCopyIgnores`, `git-worktree-manager.postCreateCmd`, and `git-worktree-manager.preRemoveCmd`.

Compiled command-handler facts from `dist/extension.js`:

- `git-worktree-manager.addWorktree` accepts an optional object whose `fsPath` is used as the repository folder. It still prompts for the source branch or commit and for the target worktree folder before creating the worktree.
- `git-worktree-manager.addWorktreeFromBranch` expects an internal tree item object with fields such as `fsPath`, `name`, and `isBranch`. It still prompts with `showOpenDialog` for the target folder before creating the worktree.
- The internal creation helper has the shape `iA({ name, label, folderPath, isBranch, cwd })`, but it is not exported as an extension API. It also prompts for creation confirmation and for whether to open the new folder.
- The lower-level internal Git helper runs `git worktree add -f --guess-remote <folderPath> <name>`, then runs `git switch` or detached switch logic inside the new worktree.
- Tree items open worktrees with `vscode.openFolder` and `{ forceNewWindow: true }`.

Implication for Sundial:

- This extension can be useful as a companion tool, but delegating Sundial's row-local spawn action to it would hand control to an interactive UI flow and would not let Sundial deterministically provide the exact spec branch and worktree path.

Sources:

- `/Users/bjackson/.vscode/extensions/jackiotyu.git-worktree-manager-3.25.0/package.json`
- `/Users/bjackson/.vscode/extensions/jackiotyu.git-worktree-manager-3.25.0/readme.md`
- `/Users/bjackson/.vscode/extensions/jackiotyu.git-worktree-manager-3.25.0/dist/extension.js`
