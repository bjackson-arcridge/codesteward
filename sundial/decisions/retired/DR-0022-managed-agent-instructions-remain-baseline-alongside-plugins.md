---
id: DR-0022
title: Managed agent instructions remain baseline alongside plugins
status: retired
domain: cli
created: 2026-05-08
references:
  - packages/cli/src/core/templates/instructions/agent-instructions.md
  - packages/cli/src/core/store.ts
  - CLI_SPEC.md
updated: 2026-05-08
author: bjackson
retired_by: DR-0033
---
## Decision

Sundial may package reusable skills as Claude or Codex plugins, but project runtime setup must still maintain substantial Sundial-managed instruction blocks in AGENTS.md and CLAUDE.md so baseline DR proposal and correction-feedback behavior is present in ordinary model interactions even when plugin loading is unavailable or disabled.

## Appendix

Plugins are the preferred distribution surface for reusable skills and versioned marketplace installation. Managed instruction blocks remain the always-on project contract: agents should know broadly when and how to propose Decision Record candidates and should apply the correction feedback loop without requiring an explicit skill invocation.
