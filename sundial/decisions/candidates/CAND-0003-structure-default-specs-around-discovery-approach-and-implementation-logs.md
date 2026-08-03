---
id: CAND-0003
title: Structure default specs around discovery approach and implementation logs
status: candidate
domain: governance
created: 2026-08-02
created_by: bjackson
references:
  - packages/cli/src/core/specs.ts#defaultSpecTemplate
  - packages/cli/src/core/templates/skills
---

## Decision

Seed new specs with explicit requirements and scope exclusions; separate Discovery, Approach, and Implementation Logs; and make data model, interface, implementation structure, code snippets, and testing explicit. Decision-aware skills describe and maintain this same section structure.

## Appendix

The user selected factorio-bob's project-local spec template as Sundial's new default in place of the generic flat outline. The grouped structure makes the planning boundary, intended interfaces and files, illustrative code, and later execution evidence visible without mixing them into one undifferentiated plan section.
