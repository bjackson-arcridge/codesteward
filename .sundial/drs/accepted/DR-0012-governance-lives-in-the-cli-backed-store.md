---
id: DR-0012
title: Governance lives in the CLI-backed store
status: accepted
domain: governance
created: 2026-05-04
tags: []
affected_files:
  - CLI_SPEC.md
  - packages/cli/src/main.ts
  - packages/vscode/src/extension.ts
references:
  - packages/vscode/src/extension.ts#runLifecycleCommand
  - packages/cli/src/main.ts#runCandidate
updated: 2026-05-04
author: bjackson
---
## Decision

Keep governance lifecycle in the sundial CLI over the hand-editable .sundial store; editor, MCP, CI, and agent adapters delegate lifecycle actions to the CLI.

## Appendix

The `.sundial/` store is intentionally hand-editable so that humans can review and version DRs as plain markdown, but lifecycle operations (accept, reject, retire, promote) touch multiple files and the vocabulary in lockstep. Centralizing those mutations in the CLI is what keeps editor, MCP, CI, and agent adapters in agreement; if the same logic were re-implemented in each adapter, the store would drift quickly.
