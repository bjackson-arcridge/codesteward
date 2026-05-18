---
id: DR-0019
title: Preserve Command Palette Access When Removing Local UI Entry Points
status: accepted
domain: vscode.extension
created: 2026-05-07
affected_files:
  - packages/vscode/package.json
  - packages/vscode/src/unit/packageManifest.test.ts
references:
  - packages/vscode/package.json#contributes.menus.view/title
updated: 2026-05-07
author: bjackson
---
## Decision

When removing a duplicate VS Code UI entry point, scope the removal to the specific surface that caused duplication, such as a view title button, row action, or webview control. Keep the command contribution and Command Palette availability unless the user explicitly asks to remove the command entirely, or the command is deprecated, unsafe, or no longer meaningful.
