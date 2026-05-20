---
id: DR-0016
title: CLI store operations avoid runtime dependencies and shell pipelines
status: accepted
domain: cli
created: 2026-05-05
references:
  - CLI_SPEC.md#Indexing-and-Windows-Compatibility
  - packages/cli/src/core/dr.ts#listDecisionRecords
  - packages/cli/src/main.ts#runBootstrapCommand
  - CLI_SPEC.md
  - packages/cli/package.json
  - packages/cli/src/core/dr.ts
  - packages/cli/src/core/tags.ts
  - packages/cli/src/main.ts
updated: 2026-05-05
author: bjackson
---
## Decision

Implement Sundial CLI store, parsing, retrieval, and lifecycle logic with Node standard-library APIs and in-repo parsers; reserve subprocess spawning for external provider or adapter invocations, not store operations.
