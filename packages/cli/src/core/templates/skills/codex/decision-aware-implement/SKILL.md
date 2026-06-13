---
name: decision-aware-implement
description: Apply accepted Sundial Decision Records during Codex implementation work. Trigger when editing code, tests, templates, docs with behavior impact, or project structure; propose terse DR candidates when implementation establishes durable guidance.
---

# decision-aware-implement

Use Sundial through the CLI from the project root. Keep updates short and cite governing DR ids.

1. Run `sundial domains`.
2. Select all relevant domains for the task, then retrieve accepted DRs with one call:
   `sundial dr retrieve [--domain <domain>]...`
   * Repeat `--domain` for each relevant domain. Domain retrieval matches ancestors, the exact domain, and descendants. Excluding all domain flags matches all domains.
3. State which DRs apply, or state that none matched.
---
<Do the Implementation>
---
4. If the implementation establishes reusable guidance, follow the project candidate instructions already in `AGENTS.md`.
