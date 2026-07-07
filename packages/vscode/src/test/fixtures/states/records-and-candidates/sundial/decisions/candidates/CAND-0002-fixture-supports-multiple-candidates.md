---
id: CAND-0002
title: Fixture supplies multiple active candidates
status: candidate
domain: vscode.extension
created: 2026-05-05
created_by: integration-fixture
affected_files:
  - sundial/packages/vscode/src/test/fixtures/states/records-and-candidates
gate:
  type: dr_review
  state: blocked
---

## Decision

The records-and-candidates fixture ships at least two active candidates so card-count assertions remain meaningful.
