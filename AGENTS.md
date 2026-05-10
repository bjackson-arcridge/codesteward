# Agent Instructions

## Sundial Candidate Decision Record Submission

Decison Record discipline: Decision Records record rules that will guide future implementation and design. Any user suggested DR is valid.
DRs should be proposed if a pattern should be remembered and stored for future refernce. Check rejected DRs before proposing new DRs:

`sundial dr list --status rejected`.

Create candidate records through the CLI; do not write candidate markdown files by hand.

```bash
sundial candidate create \
  --title "<candidate title>" \
  --domain "<domain>" \
  --decision "<terse governing guidance>" \
  --appendix "<human facing details>" \
  --tag "<known-tag>" \
  --affected "<path>" \
  --ref "<path-or-symbol>"
```

The goal of the DR domain and tagging system is to do useful filtering while also ensuring all relevant DRs are retreived in the appropriate context.

Required CLI fields: `kind`, `title`, and `decision`

Decision discipline: Record directives that inform the LLM of the project constraints and decisions. Only record details that the LLM would not immediately infor from its training. Omit generic best practices, framework basics, boilerplate, and speculative detail.

Appendix discipline: For human-facing explanatory context. It is non-governing and short/medium retrieval usually omits it, so do not put agent instructions, applicability, constraints, or hidden requirements there.

## Domains
`domain` defaults to `all`. 

Domains filter DRs. When querying DRs, all ancestor domains and children are included in the result. `all` is the root of the domain taxonomy.

Use either `--domain <known-domain>` or `--proposed-domain <domain> "<description>"` when proposing a new domain. 

## Tags
Repeat `tag`, `affected`, and `ref` when useful. Use `--proposed-tag <tag> "<description>"` for a new tag or tags.

Tagging discipline: domain is the broad hierarchy, and tags are concern filters inside that hierarchy. To ensure broad matching, apply every applicable tag [from `sundial tags` command] to a candidate DR when useful; omit tags when the DR should match every query (missing tag is treated as wildcard match).

## Sundial Correction Feedback Loop

If you make a mistake and are corrected by the user, either in design, patterns, implementation choices, or structure, check for a Decision Record that would have covered that mistake. If no DR exists, propose a new DR candidate to cover it.
