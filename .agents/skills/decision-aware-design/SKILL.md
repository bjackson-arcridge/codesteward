---
name: decision-aware-design
description: Consult accepted Sundial Decision Records before consequential Codex design work. Trigger for architecture, workflow, API, UI, or governance design choices that need project precedent; propose terse DR candidates when the design establishes durable guidance.
---

# decision-aware-design

Use Sundial through the CLI from the project root. Keep updates short and cite governing DR ids.

1. Run `sundial domains`.
2. Retrieve accepted DRs for the narrowest relevant domain:
   `sundial dr retrieve [--domain <domain>]`
   * Domain retrieval matches ancestors, the exact domain, and descendants. Excluding the domain matches all domains.
3. State which DRs apply, or state that none matched.
---
<Do the Design Work>
---
4. Only propose a DR candidate when the design establishes guidance that would change how a future agent acts on a similar task. Skip candidates for one-off rationale, backward-facing summaries, obvious codebase facts, or details that would not constrain future design or implementation. If the guidance passes that test, follow the project candidate instructions already in `AGENTS.md`.
