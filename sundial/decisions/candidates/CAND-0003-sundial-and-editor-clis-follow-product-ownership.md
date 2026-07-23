---
id: CAND-0003
title: Sundial and Editor CLIs follow product ownership
status: candidate
domain: all
created: 2026-07-23
created_by: bjackson
references:
  - sundial/specs/SPEC-0011-expand-worktree-support.md
  - /Users/bjackson/Code/sundial-editor/sundial/specs/SPEC-0022-expose-creating-agent-tasks-via-vs-code-commands.md
---

## Decision

The Sundial CLI owns specs, decisions, research, and managed worktree lifecycle; sundial-editor-cli owns agents, sessions, queues, and agent work.

## Pitfalls

Do not add worktree topology or Git finish commands to sundial-editor-cli, and do not add agent queue or session mutations to the Sundial CLI.

## Appendix

The VS Code extensions may coordinate the two products, but each mutation remains delegated to its owning CLI.
