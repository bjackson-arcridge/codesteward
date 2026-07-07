---
id: CAND-0003
title: Duplicated runtime skill guidance has drift checks
status: candidate
domain: cli
created: 2026-07-07
created_by: bjackson
references:
  - packages/cli/src/core/templates/skills
  - packages/cli/src/unit/store.test.ts
---

## Decision

When harness-specific skill templates intentionally duplicate shared runtime guidance, keep the shared behavioral requirements guarded by tests or another explicit drift check while allowing harness-specific customization.

## Pitfalls

Do not update only one harness-specific skill template for shared instructions; do not force centralization solely to avoid duplication when harness-specific wording may need to diverge.

## Appendix

The decision-aware skill templates have Codex, Claude, and generic variants. A CLI unit test now checks that shared spec-driven development guidance remains present across all duplicated variants.
