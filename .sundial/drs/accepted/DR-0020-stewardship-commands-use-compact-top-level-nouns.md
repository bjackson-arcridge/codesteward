---
id: DR-0020
title: Stewardship commands use compact top-level nouns
status: accepted
domain: cli
created: 2026-05-08
affected_files:
  - packages/cli/src/main.ts
  - CLI_SPEC.md
  - packages/vscode/src/extension.ts
updated: 2026-05-08
author: bjackson
---
## Decision

Expose recurring stewardship workflows as compact top-level commands: status reports store health and validation, bootstrap starts LLM-backed candidate discovery, and tags prints the full vocabulary. Avoid parallel command families when one noun can own the workflow.
