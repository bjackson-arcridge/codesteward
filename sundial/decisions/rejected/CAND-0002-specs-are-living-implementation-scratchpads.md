---
id: CAND-0002
title: Specs are living implementation scratchpads
status: rejected
domain: governance
created: 2026-07-07
created_by: bjackson
references:
  - sundial/specs
rejection_reason: Rejected after user correction: modeling each spec as a whole Kanban board gives agents poor retrieval granularity; spec work items should remain separately addressable markdown units.
---
## Decision

Specs live under sundial/specs as markdown implementation scratchpads with status Planning, Implementation, Review, or Done; they have no domain metadata and should be listed by title in the Specs sidebar.

## Pitfalls

Do not make specs backward-looking summaries outside sections intended for history, such as Rejected Alternatives, Implementation Log, and Test Log; do not route specs through DR lifecycle or domain retrieval behavior.

## Appendix

Specs use sections for Discovery, Applicable Decision Records, Applicable Research Notes, Planned Approach, optional Rejected Alternatives, Test Plan, Open Questions, Implementation Log, and Test Log.
