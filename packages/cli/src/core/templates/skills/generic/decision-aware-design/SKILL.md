---
name: decision-aware-design
description: Consult accepted Sundial Decision Records before consequential design work. Trigger for architecture, workflow, API, UI, or governance design choices that need project precedent; propose terse DR candidates when the design establishes durable guidance.
---

# decision-aware-design

1. Run `sundial tags` to get the list of tags and domains.
2. Select the narrowest applicable domain and one or more applicable tags.
3. Retrieve accepted DRs with `sundial dr retrieve [--domain <domain>] [--tag <tag1>] [--tag <tag2>] ...`.
 * Retrieval logic is domain AND (tag1 OR tag2 OR tag3).
 * Domain retrieval matches ancestors, the exact domain, and descendants. Excluding the domain matches all domains.
 * No-tag DRs may still appear because they match any tag query within their matching domain.
4. Indicate to the user which DRs are being applied.
---
<Do the Design Work>
---
5. After the design is complete, use this rubric to propose new DRs.
 * Were any patterns established that should be encoded to ensure consistent future design?
 * Were any alternatives considered and rejected?
 * Did the user have to redirect and can that be encoded for future consideration.
