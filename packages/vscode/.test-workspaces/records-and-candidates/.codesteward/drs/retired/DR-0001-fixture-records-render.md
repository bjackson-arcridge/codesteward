---
id: DR-0001
title: Fixture records must render in the records webview
status: retired
domain: vscode.webview.ui
created: 2026-05-05
tags:
  - fixtures
  - rendering
affected_files:
  - codesteward/packages/vscode/src/test/fixtures/states/records-and-candidates
references: []
updated: 2026-05-05
author: integration-fixture
retired_by: DR-0002
---
## Decision

Fixture decision records exist solely to drive deterministic VS Code integration test assertions and must round-trip through the records webview unchanged.
