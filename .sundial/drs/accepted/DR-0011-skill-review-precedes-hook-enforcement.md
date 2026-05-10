---
id: DR-0011
title: Skill review precedes hook enforcement
status: accepted
domain: governance.review
created: 2026-05-04
tags: []
affected_files:
  - IMPLEMENTATION_APPROACH.md
  - .agents/skills/decision-aware-design/SKILL.md
  - .agents/skills/decision-aware-implement/SKILL.md
  - .claude/skills/decision-aware-design/SKILL.md
  - .claude/skills/decision-aware-implement/SKILL.md
references:
  - IMPLEMENTATION_APPROACH.md
updated: 2026-05-07
author: bjackson
---
## Decision

Use decision-aware skill review as the first review mechanism; add hook enforcement or delegated review adapters only after a concrete gap proves skill-level review insufficient.

## Appendix

Hooks run on every event and are slow to iterate on once they're freezing rules into the harness. Keeping review inside `decision-aware-design` and `decision-aware-implement` lets Sundial validate the workflow across runtimes before adding runtime-specific adapters.
