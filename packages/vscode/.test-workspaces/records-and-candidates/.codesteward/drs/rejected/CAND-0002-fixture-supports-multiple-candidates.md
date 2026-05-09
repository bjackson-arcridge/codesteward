---
id: CAND-0002
title: Fixture supplies multiple active candidates
status: rejected
domain: vscode.extension
created: 2026-05-05
created_by: integration-fixture
tags:
  - fixtures
affected_files:
  - codesteward/packages/vscode/src/test/fixtures/states/records-and-candidates
gate:
  type: dr_review
  state: blocked
rejection_reason: Rejected by integration coverage.
---
## Decision

The records-and-candidates fixture ships at least two active candidates so card-count assertions remain meaningful.
