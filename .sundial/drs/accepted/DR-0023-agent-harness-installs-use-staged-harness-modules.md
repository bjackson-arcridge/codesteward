---
id: DR-0023
title: Agent harness installs use staged harness modules
status: accepted
domain: cli
created: 2026-05-08
affected_files:
  - packages/cli/src/core/harnesses.ts
  - packages/cli/src/core/store.ts
  - packages/cli/src/core/templates/skills/generic
  - packages/cli/src/core/templates/skills/claude
  - packages/cli/src/core/templates/skills/codex
references:
  - packages/cli/src/core/harnesses.ts
  - packages/cli/src/core/store.ts
  - packages/cli/src/unit/store.test.ts
updated: 2026-05-08
author: bjackson
---
## Decision

Each agent harness integration must install through a harness-specific module that first declares and repairs that harness's managed instruction target, then runs harness-specific skill or plugin management; shared installer infrastructure must detect symlinked instruction or skill targets and avoid writing conflicting harness-specific content into shared files.

## Appendix

This keeps Claude, Codex, and future harness support additive without baking each runtime into store initialization. Harness-specific skill templates may be optimized per model, but when multiple harnesses share one skill path through symlinks, Sundial should install the generic shared skill templates.
