---
name: decision-aware-implement
description: Use in Claude Code during implementation, when writing non-trivial code, or when establishing new patterns to stay aligned with accepted Sundial Decision Records and capture new reusable decisions.
---

# decision-aware-implement

## Available domains
!`sundial domains`

## Retrieval syntax
!`sundial dr retrieve --help`

## Steps
1. Select all relevant domains for the task.
2. Retrieve accepted DRs with one `sundial dr retrieve` call, repeating `--domain` for each relevant domain.
3. State which DRs apply.
---
<Do the implementation>
---
4. Evaluate for new DR candidates per the candidate submission process in CLAUDE.md. Beyond the correction case noted there, also propose when a binding pattern was established or an alternative was deliberately rejected.
