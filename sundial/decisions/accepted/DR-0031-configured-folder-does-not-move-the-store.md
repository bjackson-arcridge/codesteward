---
id: DR-0031
title: Configured folder does not move the store
status: accepted
domain: cli
created: 2026-07-09
references:
  - packages/cli/src/core/store.ts
  - packages/cli/src/main.ts
  - packages/cli/README.md
updated: 2026-07-10
author: bjackson
---
## Decision

Treat sundial/config.json folder as the target project folder for bootstrap cwd and managed agent runtime assets while keeping the canonical store at <root>/sundial.

## Pitfalls

Do not move Decision Records, research notes, specs, domains, or store documentation under the configured folder; only runtime-facing assets and bootstrap execution use that target folder.
