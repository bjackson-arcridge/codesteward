---
id: DR-0034
title: Domain vocabularies use canonical lexical order
status: accepted
domain: cli
created: 2026-07-24
references:
  - packages/cli/src/core/domains.ts
  - sundial/specs/SPEC-0012-domain-bootstrapping-workflow.md
updated: 2026-07-24
author: bjackson
---
## Decision

Keep domain reads non-mutating; after every CLI-owned vocabulary mutation, serialize definitions in deterministic ascending lexical name order, and present domain lists in that same order across adapters.

## Appendix

Legacy hand-edited unsorted files may be presented in canonical order without being rewritten; the next managed mutation canonicalizes the stored Domains section.
