---
id: DR-0027
title: Governance sidebars refresh on store file changes
status: accepted
domain: vscode.extension
created: 2026-07-07
references:
  - packages/vscode/src/extension.ts#governanceWatcher
updated: 2026-07-07
author: bjackson
---
## Decision

VS Code governance sidebar providers should refresh when sundial/decisions markdown files are created, changed, or deleted, including changes made by external CLI commands.

## Pitfalls

Do not rely only on extension-initiated lifecycle callbacks for candidate and DR freshness; terminal commands and other file edits can otherwise leave webviews stale until focus or visibility changes.

## Appendix

Added after candidate dismiss deleted the file but the sidebar could remain stale without a store file watcher.
