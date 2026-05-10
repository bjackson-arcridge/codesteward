---
name: decision-aware-design
description: Consult accepted Sundial Decision Records before consequential Codex design work. Trigger for architecture, workflow, API, UI, or governance design choices that need project precedent; propose terse DR candidates when the design establishes durable guidance.
---

# decision-aware-design

Use Sundial through the CLI from the project root. Keep updates short and cite governing DR ids.

1. Run `sundial tags`.
2. Retrieve accepted DRs for the narrowest relevant domain and useful tags:
   `sundial dr retrieve [--domain <domain>] [--tag <tag>] [--tag <tag>]`
   * Retrieval logic is domain AND (tag1 OR tag2 OR tag3).
   * Domain retrieval matches ancestors, the exact domain, and descendants. Excluding the domain matches all domains.
   * No-tag DRs may still appear because they match any tag query within their matching domain.
3. State which DRs apply, or state that none matched.
---
<Do the Design Work>
---
4. If the design establishes reusable guidance, follow the project candidate instructions already in `AGENTS.md`.
