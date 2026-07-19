---
id: DR-0032
title: VS Code tests use a verified project-managed runtime
status: accepted
domain: vscode.extension
created: 2026-07-13
references:
  - scripts/prepare-vscode-test-runtime.mjs
updated: 2026-07-19
author: bjackson
---
## Decision

Run VS Code integration tests against one pinned runtime downloaded through the official test downloader into the project cache; pass that executable through test-cli's supported `useInstallation.fromPath` field and do not depend on a machine-wide VS Code installation. On macOS, verify the bundle before launch and locally ad-hoc sign only a fresh checksum-validated official download when its archive signature is unusable.

## Appendix

This keeps local, sandboxed-agent, and CI test behavior aligned while allowing transient upstream packaging-signature failures to be repaired only in the disposable test cache.
