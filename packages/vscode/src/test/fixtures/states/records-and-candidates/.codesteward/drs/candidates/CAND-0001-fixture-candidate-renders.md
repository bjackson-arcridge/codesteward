---
id: CAND-0001
title: Fixture candidate must render in the candidates webview
status: candidate
domain: vscode.webview.ui
created: 2026-05-05
created_by: integration-fixture
tags:
  - fixtures
affected_files:
  - codesteward/packages/vscode/src/test/fixtures/states/records-and-candidates
gate:
  type: dr_review
  state: blocked
---

## Decision

A candidate present in the fixture state must surface in the candidates webview so the harness can assert non-empty rendering.
