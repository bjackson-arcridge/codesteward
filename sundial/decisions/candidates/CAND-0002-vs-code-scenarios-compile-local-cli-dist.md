---
id: CAND-0002
title: VS Code scenarios compile local CLI dist
status: candidate
domain: vscode.extension
created: 2026-07-07
created_by: bjackson
references:
  - packages/vscode/package.json#scripts
---

## Decision

VS Code integration test setup must compile the local CLI package before scenarios configure sundial.cliPath to packages/cli/dist/main.js.

## Pitfalls

Do not assume compiling the VS Code extension refreshes packages/cli/dist; stale CLI dist can hide or break newly added CLI lifecycle commands.

## Appendix

Added after candidate dismiss required a new CLI command and the focused VS Code lifecycle scenario initially exercised an older packages/cli/dist/main.js.
