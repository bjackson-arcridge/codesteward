# Sundial Agent Instructions

Sundial is the tool used to manage all persistent memory and decisions for this project.

1. Run `sundial domains` to get the list of known domains.
2. Select all relevant domains for the task.
3. Retrieve accepted DRs with one call: `sundial dr retrieve [--domain <domain>]...`.
 * Repeat `--domain` for each relevant domain. Domain retrieval matches ancestors, the exact domain, and descendants. Excluding all domain flags matches all domains.
4. Indicate to the user which DRs are being applied.

## Domains

`domain` defaults to `all`.

Domains filter DRs. When querying DRs, use one `sundial dr retrieve` call with all relevant domains; all ancestor domains and children for each queried domain are included in the result. `all` is the root of the domain taxonomy.

## Sundial Spec Phase Sessions

When a prompt asks you to use Sundial planning skill/instructions for a `SPEC-*`, treat it as the planning phase. Use the decision-aware-design skill if available, avoid implementing feature code, and only write or run small probes when needed to validate assumptions. Keep the spec's Planned Approach, Rejected Alternatives, Test Plan, and Open Questions current.

When a prompt asks you to use Sundial implementation skill/instructions for a `SPEC-*`, treat it as the implementation phase. Use the decision-aware-implement skill if available, implement the referenced spec end to end where feasible, keep Implementation Log and Test Log current, and report skipped tests with concrete blockers.

When a prompt asks you to use Sundial review skill/instructions for a `SPEC-*`, treat it as the review phase. Use the decision-aware-review skill if available, lead with findings ordered by severity, audit completeness against the spec and applicable DRs, verify testing/security posture, and do not implement fixes unless explicitly asked.

## Sundial Candidate Decision Record Submission

Decision Record discipline: Decision Records record rules that will guide future implementation and design. Any user suggested DR is valid. The Agent should propose DRs judiciously only when a pattern should be remembered and stored for future reference, and will have long-reaching implications within a module or is valid beyond the scope of a single file or module.

First internally consider a DR with the following parts:

A Decision contains the governing guidance.  It is as short as possible to convey the governance to an LLM.  Token minimization is the goal. Positive (do this) and Negative (don't do this) framing or a mixture are valid. Only record details that the LLM would not immediately infer from its training. Omit generic best practices, framework basics, boilerplate, and speculative detail.

A decision should contain no redundancies; it is optimized for brevity. Every clause adds information that cannot be inferred from general engineering knowledge.

An Appendix is optional and can contain more historical and user-facing context. Appendix is non-governing material intended primarily for future human reference, not normal agent retrieval. Use it when there was a significant conversation with the user on this decision and/or investigation of alternatives was done prior to proposing the decision. Do not use it as a matter of course. The appendix can optimize for narrative over conciseness, but should be a maximum of 200 words.

References identify the strongest available project source for the decision.

Revise the draft to fix any rubric failures, then call the create command once with the final fields. Do not create candidate records as part of the drafting or evaluation loop, and do not write candidate markdown files by hand.

```bash
sundial candidate create \
  --title "<candidate title>" \
  --domain "<domain>" \
  --decision "<terse governing guidance>" \
  --ref "<path-or-symbol>"
```

Add `--appendix` only when the draft passes the appendix rubric above.

The goal of the DR domain system is to do useful filtering while also ensuring all relevant DRs are retrieved in the appropriate context.

Use either `--domain <known-domain>` or `--proposed-domain <domain> "<description>"` when proposing a new domain.

## Sundial Correction Feedback Loop

If you make a mistake and are corrected by the user, either in design, patterns, implementation choices, or structure, consider if this is a one-off correction or if there is a general forward-looking pattern that can be encoded as a decision record. 
