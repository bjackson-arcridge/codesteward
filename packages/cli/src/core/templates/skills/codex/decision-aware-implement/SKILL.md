---
name: decision-aware-implement
description: Apply accepted CodeSteward Decision Records during Codex implementation work. Trigger when editing code, tests, templates, docs with behavior impact, or project structure; propose terse DR candidates when implementation establishes durable guidance.
---

# decision-aware-implement

Use CodeSteward through the CLI from the project root. Keep updates short and cite governing DR ids.

1. Run `codesteward tags`.
2. Retrieve accepted DRs for the narrowest relevant domain and useful tags:
   `codesteward dr retrieve [--domain <domain>] [--tag <tag>] [--tag <tag>]`
   * Retrieval logic is domain AND (tag1 OR tag2 OR tag3).
   * Domain retrieval matches ancestors, the exact domain, and descendants. Excluding the domain matches all domains.
   * No-tag DRs may still appear because they match any tag query within their matching domain.
3. State which DRs apply, or state that none matched.
---
<Do the Implementation>
---
4. If the implementation establishes reusable guidance, follow the project candidate instructions already in `AGENTS.md`.
