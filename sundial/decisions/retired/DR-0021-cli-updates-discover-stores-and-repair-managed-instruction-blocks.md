---
id: DR-0021
title: CLI updates discover stores and repair managed instruction blocks
status: retired
domain: cli
created: 2026-05-08
references:
  - packages/cli/src/core/store.ts
  - packages/cli/src/main.ts
  - packages/cli/src/core/templates/instructions/agent-instructions.md
updated: 2026-05-08
author: bjackson
retired_by: DR-0033
---
## Decision

Existing-store Sundial CLI commands may discover the nearest ancestor .sundial store from the invocation directory; update must also support an explicit --root override and must repair only Sundial-owned managed instruction blocks in runtime instruction files.

## Appendix

This keeps subfolder agent sessions usable while avoiding arbitrary working-directory targeting for initialization. Runtime files such as AGENTS.md and .claude/CLAUDE.md use the same managed block markers so shared or symlinked instruction files receive one repairable Sundial block.
