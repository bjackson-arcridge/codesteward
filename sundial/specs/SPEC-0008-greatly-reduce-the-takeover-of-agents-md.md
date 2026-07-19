---
id: SPEC-0008
title: Greatly reduce the takeover of agents.md
status: Done
created: 2026-07-19
updated: 2026-07-19
created_by: bjackson
---
# Greatly reduce the takeover of agents.md

We want to simply reinforce that any design work should be done using decision-aware-design.

## Discovery

The CLI currently installs the full `sundial:agent-instructions` managed block into
`AGENTS.md` and `.claude/CLAUDE.md`. The same content is also rendered into the
bootstrap prompt, while the decision-aware skills contain overlapping workflow
guidance. Runtime installation and update behavior is owned by
`packages/cli/src/core/store.ts` and harness-specific targets are declared in
`packages/cli/src/core/harnesses.ts`.

## Applicable Decision Records

- DR-0021: updates discover stores and repair Sundial-owned instruction blocks.
- DR-0022: currently requires substantial managed blocks in runtime instruction
  files; this implementation intentionally replaces that policy per user direction.
- DR-0023: harness-specific runtime assets install through staged harness modules.
- DR-0025: generated CLI asset changes require CLI version review.
- DR-0031: the configured runtime folder does not move the canonical `sundial/`
  store.

## Applicable Research Notes

## Planned Approach

1. Install and refresh `sundial/SUNDIAL-INSTRUCTIONS.md` as a canonical store
   asset on every init/update, independent of selected agent harnesses.
2. Stop creating managed blocks in `AGENTS.md` and `.claude/CLAUDE.md`; when
   either harness is selected, remove legacy Sundial-managed blocks while
   preserving user-authored content.
3. Make every decision-aware design, implementation, and review skill template
   explicitly read the canonical instructions file.
4. Update installed project skills, docs, provider detection, tests, and package
   versions to match the new asset layout.

## Rejected Alternatives

- Keep a short forwarding block in `AGENTS.md`: rejected because the requested
  ownership model is for decision-aware skills to reference the canonical file.
- Install `SUNDIAL-INSTRUCTIONS.md` in the configured runtime folder: rejected
  because Sundial store assets remain under the canonical `sundial/` directory.

## Test Plan

- CLI store unit tests for unconditional instruction-file installation,
  idempotent refresh, configured folders, and legacy block removal.
- CLI command tests for the generated path layout.
- Type checking, lint, unit tests, and VS Code integration tests.

## Open Questions

None.

## Implementation Log

- Added the managed store template and installed project copy at
  `sundial/SUNDIAL-INSTRUCTIONS.md`.
- Removed the managed Sundial blocks from this project's `AGENTS.md` and
  `.claude/CLAUDE.md`.
- Changed harness installation to install skills without creating agent
  instruction files and to remove legacy marker-delimited blocks on update.
- Updated all Claude, Codex, and generic decision-aware skill templates and
  installed project skills to reference the canonical instructions.
- Updated CLI/VS Code docs, Codex harness detection, tests, and package versions.
- Created CAND-0005 to capture the canonical-file policy that supersedes
  DR-0022 if accepted.

## Test Log

- `npm run check-types` — passed.
- `npm run lint` — passed.
- `npm run test:unit` — passed (60 CLI tests and 77 VS Code unit tests).
- `npm test` — passed all three VS Code integration scenarios against the
  verified project-managed VS Code 1.118.1 runtime.
