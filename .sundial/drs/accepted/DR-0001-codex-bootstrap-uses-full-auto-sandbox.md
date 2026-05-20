---
id: DR-0001
title: Codex bootstrap uses full-auto sandbox
status: accepted
domain: cli.bootstrap
created: 2026-05-04
references:
  - packages/cli/src/main.ts#bootstrapCommand
  - packages/cli/src/main.ts
updated: 2026-05-04
author: bjackson
---
## Decision

Run Codex bootstrap with codex exec --full-auto so candidate creation is autonomous inside the workspace-write, network-disabled sandbox.

## Appendix

Bootstrap scans a project unattended to propose the initial set of candidate DRs. `--full-auto` removes the per-action prompts that Codex would otherwise raise, and the workspace-write, network-disabled sandbox is what makes that unattended mode acceptable: bootstrap can read and write inside the project but cannot reach the network or files outside it.
