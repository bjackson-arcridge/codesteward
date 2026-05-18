---
id: DR-0017
title: VS Code tests use staged scenario workspaces
status: accepted
domain: vscode.extension
created: 2026-05-05
affected_files:
  - .vscode-test.mjs
  - packages/vscode/src/test/prepare-workspaces.mjs
  - packages/vscode/src/test/fixtures
references:
  - .vscode-test.mjs#userDataRoot
  - packages/vscode/src/test/prepare-workspaces.mjs#main
updated: 2026-05-05
author: bjackson
---
## Decision

Run VS Code integration scenarios against prepared .test-workspaces/<scenario> copies with a short tmp user-data root; do not open shared fixtures directly or place test user data under the package tree.
