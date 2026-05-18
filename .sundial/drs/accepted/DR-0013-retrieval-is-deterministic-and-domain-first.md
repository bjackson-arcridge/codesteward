---
id: DR-0013
title: Retrieval is deterministic and domain-first
status: accepted
domain: governance.dr-retrieval
created: 2026-05-04
affected_files:
  - RETRIEVAL.md
  - CLI_SPEC.md
  - packages/cli/src/main.ts
  - packages/cli/src/core/dr.ts
references:
  - packages/cli/src/main.ts#runDrRetrieve
  - packages/cli/src/main.ts#renderRecord
updated: 2026-05-08
author: bjackson
---
## Decision

Retrieve precedent only from enabled accepted DRs by domain hierarchy and staged detail; agents choose applicability instead of relying on semantic search or ranking.

## Appendix

DRs are project memory rather than a search corpus, and the same task should retrieve the same precedent regardless of which provider, embedding model, or session is asking. Domain-hierarchy addressing makes that reproducible by construction; applicability is then a judgement the agent makes against retrieved records, not a property the retrieval layer guesses.
