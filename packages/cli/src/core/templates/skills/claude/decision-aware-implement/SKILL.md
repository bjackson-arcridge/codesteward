---
name: decision-aware-implement
description: Use in Claude Code during implementation, when writing non-trivial code, or when establishing new patterns to stay aligned with accepted CodeSteward Decision Records and capture new reusable decisions.
---

# decision-aware-implement

## Available tags and domains
!`codesteward tags`

## Retrieval syntax
!`codesteward dr retrieve --help`

## Steps
1. Narrow the domain; include all useful tags from above.
2. Retrieve accepted DRs.
3. State which DRs apply.
---
<Do the implementation>
---
4. Evaluate for new DR candidates per the candidate submission process in CLAUDE.md. Beyond the correction case noted there, also propose when a binding pattern was established or an alternative was deliberately rejected.
