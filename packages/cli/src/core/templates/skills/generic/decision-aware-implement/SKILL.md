---
name: decision-aware-implement
description: Apply accepted Sundial Decision Records during implementation work. Trigger when editing code, tests, templates, docs with behavior impact, or project structure; propose terse DR candidates when implementation establishes durable guidance.
---

# decision-aware-implement

1. Run `sundial domains` to get the list of known domains.
2. Select the narrowest applicable domain.
3. Retrieve accepted DRs with `sundial dr retrieve [--domain <domain>]`.
 * Domain retrieval matches ancestors, the exact domain, and descendants. Excluding the domain matches all domains.
4. Indicate to the user which DRs are being applied.
---
<Do the Implementation>
---
5. After the implementation is complete, use this rubric to propose new DRs.
 * Were any patterns established that should be encoded to inform future implementation?
 * Were any alternatives considered and rejected?
 * Did the user have to redirect and can that be encoded for future consideration.
