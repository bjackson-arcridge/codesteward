---
name: decision-aware-design
description: Use in Claude Code before consequential design work, architecture decisions, or non-trivial planning to consult accepted Sundial Decision Records and propose new DR candidates afterward.
---

# decision-aware-design

## Available domains
!`sundial domains`

## Retrieval syntax
!`sundial dr retrieve --help`

## Steps
1. Select all relevant domains for the task.
2. Retrieve accepted DRs with one `sundial dr retrieve` call, repeating `--domain` for each relevant domain.
3. State which DRs apply.
---
<Do the design work>
---
4. Evaluate for new DR candidates per the candidate submission process in CLAUDE.md. Beyond the correction case noted there, also propose when a binding pattern was established or an alternative was deliberately rejected.
