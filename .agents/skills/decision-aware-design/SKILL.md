---
name: decision-aware-design
description: Consult accepted Sundial Decision Records before consequential Codex design work. Trigger for architecture, workflow, API, UI, or governance design choices that need project precedent; propose terse DR candidates when the design establishes durable guidance.
---

# decision-aware-design

Use Sundial through the CLI from the project root. Keep updates short and cite governing DR ids.

1. Run `sundial domains`.
2. Select all relevant domains for the task, then retrieve accepted DRs with one call:
   `sundial dr retrieve [--domain <domain>]...`
   * Repeat `--domain` for each relevant domain. Domain retrieval matches ancestors, the exact domain, and descendants. Excluding all domain flags matches all domains.
3. State which DRs apply, or state that none matched.
---
<Do the Design Work>
---
4. If the design establishes reusable guidance, follow the project candidate instructions already in `AGENTS.md`.
