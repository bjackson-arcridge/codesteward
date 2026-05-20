---
id: DR-0010
title: VS Code per-item actions stay localized to the row, not in showQuickPick
status: accepted
domain: vscode.extension
created: 2026-05-04
references:
  - packages/vscode/package.json
  - packages/vscode/src/extension.ts
updated: 2026-05-04
author: bjackson
---
## Decision

Per-item actions in Sundial sidebar sections are exposed via row-anchored affordances (TreeView inline icons + context menu, or webview popover); vscode.window.showQuickPick is reserved for modal, searchable, single-selection flows.

## Appendix

QuickPick takes the user out of the list and into a modal picker, which is the right shape when the user is choosing one of many but the wrong shape when they are operating on a row they're already looking at. Earlier iterations mixed the two and produced flows where users lost their place during routine actions; localizing the action to the row keeps context.
