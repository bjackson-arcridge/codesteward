---
id: RES-0003
title: VS Code open folder command
domain: vscode.extension
summary: VS Code documents `vscode.openFolder` as the built-in command for opening a folder or workspace URI from an extension. Load this when implementing extension-host flows that create a folder and then need VS Code to open it.
created: 2026-07-08
updated: 2026-07-08
---

## Research

Verified on 2026-07-08 from the official VS Code Built-in Commands reference:

- `vscode.commands.executeCommand('vscode.openFolder', uri)` is the documented sample for opening a folder in VS Code.
- The sample uses `Uri.file('/some/path/to/folder')` for the folder URI.
- The command returns a success value in the official sample.

Local type context from `node_modules/@types/vscode/index.d.ts` also references using `vscode.openFolder` with a workspace URI to reopen a workspace location.

Sources:

- https://code.visualstudio.com/api/references/commands
- `node_modules/@types/vscode/index.d.ts`
