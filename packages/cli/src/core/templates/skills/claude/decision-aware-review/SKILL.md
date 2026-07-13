---
name: decision-aware-review
description: Use in Claude Code during review of non-trivial changes or Sundial SPEC review phases to audit DR alignment, completeness, testing, and security without taking over implementation.
---

# decision-aware-review

## Available domains
!`sundial domains`

## Retrieval syntax
!`sundial dr retrieve --help`

## Steps
1. Select all relevant domains for the task.
2. Retrieve accepted DRs with one `sundial dr retrieve` call, repeating `--domain` for each relevant domain.
3. State which DRs apply.

## Optional Spec-Driven Review
- Use a spec when the user asks for review of a `SPEC-*`, when an existing `SPEC-*` is the working context, or when the change is large enough that completeness needs to be checked against a plan.
- Read the spec's Discovery, Applicable Decision Records, Planned Approach, Rejected Alternatives, Test Plan, Open Questions, Implementation Log, and Test Log before judging completeness.
- Review should audit implementation completeness, testing performed or missing, security/privacy risks, and adherence to applicable DRs.
- Lead with findings ordered by severity and include concrete file/line references when available; keep summaries brief and secondary.
- Do not implement fixes during review unless the user explicitly asks. Running commands, inspecting code, and small local probes to validate review claims are appropriate.
- Keep the spec current by appending concise review outcomes, test evidence, skipped tests, or unresolved questions to Test Log or Open Questions.
---
<Do the Review>
---
4. Evaluate for new DR candidates per the candidate submission process in CLAUDE.md. Beyond the correction case noted there, also propose only when a binding pattern was established or an alternative was deliberately rejected.
