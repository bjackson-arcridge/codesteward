---
id: CAND-0001
title: Store decisions under visible sundial directory
status: candidate
domain: governance
created: 2026-07-07
created_by: bjackson
references:
  - packages/cli/src/core/store.ts
---

## Decision

Store the project-local Sundial repository in the visible sundial/ directory, with decision lifecycle files under sundial/decisions/{accepted,candidates,rejected,retired}/.

## Pitfalls

Do not introduce new code, docs, fixtures, or generated guidance that refers to the old .sundial/ store or sundial/drs/ lifecycle paths.
