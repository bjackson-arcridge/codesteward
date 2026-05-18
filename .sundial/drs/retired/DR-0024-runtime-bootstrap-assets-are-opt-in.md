---
id: DR-0024
title: Runtime bootstrap assets are opt-in
status: retired
domain: cli
created: 2026-05-05
affected_files:
  - CLI_SPEC.md
  - packages/cli/src/core/store.ts
  - packages/cli/src/main.ts
  - packages/vscode/src/extension.ts
references:
  - packages/cli/src/core/store.ts#initStore
  - packages/vscode/src/extension.ts#initializeProject
updated: 2026-05-08
author: bjackson
---
## Decision

sundial init always creates the .sundial store, but writes .claude and .agents runtime assets only when the corresponding --claude or --codex flag is selected from an explicit project root.
