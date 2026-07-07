---
name: decision-aware-implement
description: Apply accepted Sundial Decision Records during Codex implementation work. Trigger when editing code, tests, templates, docs with behavior impact, or project structure; propose terse DR candidates when implementation establishes durable guidance.
---

# decision-aware-implement

Use Sundial through the CLI from the project root. Keep updates short and cite governing DR ids.

1. Run `sundial domains`.
2. Retrieve accepted DRs for the narrowest relevant domain:
   `sundial dr retrieve [--domain <domain>]`
   * Domain retrieval matches ancestors, the exact domain, and descendants. Excluding the domain matches all domains.
3. State which DRs apply, or state that none matched.
---
<Do the Implementation>
---
4. Only propose a DR candidate when the implementation establishes guidance that would change how a future agent acts on a similar task. Skip candidates for one-off fixes, backward-facing rationale, obvious codebase facts, or details that would not constrain future design or implementation. If the guidance passes that test, follow the project candidate instructions already in `AGENTS.md`.
