---
name: decision-aware-design
description: Use in Claude Code before consequential design work, architecture decisions, or non-trivial planning to consult accepted CodeSteward Decision Records and propose new DR candidates afterward.
---

# decision-aware-design

## Available tags and domains
!`codesteward tags`

## Retrieval syntax
!`codesteward dr retrieve --help`

## Steps
1. Narrow the domain; include all useful tags from above.
2. Retrieve accepted DRs.
3. State which DRs apply.
---
<Do the design work>
---
4. Evaluate for new DR candidates per the candidate submission process in CLAUDE.md. Beyond the correction case noted there, also propose when a binding pattern was established or an alternative was deliberately rejected.
