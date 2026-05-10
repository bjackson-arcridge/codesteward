---
id: DR-0004
title: Fixture candidate must render in the candidates webview
status: accepted
domain: vscode.webview.ui
created: 2026-05-05
tags:
  - fixtures
affected_files:
  - sundial/packages/vscode/src/test/fixtures/states/records-and-candidates
gate:
  type: dr_review
  state: blocked
updated: 2026-05-08
author: integration-fixture
---
## Decision

A candidate present in the fixture state must surface in the candidates webview so the harness can assert non-empty rendering.
