---
id: SPEC-0001
title: Embedded specs board MVP
status: Done
created: 2026-07-07
updated: 2026-07-07
created_by: bjackson
---
# Embedded specs board MVP

## Discovery

- Sundial already has a Specs sidebar MVP that can scan spec markdown files.
- External Markdown Kanban extensions work as generic board views, but do not understand Sundial's canonical task/spec artifacts.
- The project direction changed toward a Sundial-owned embedded board so navigation and task creation can be artifact-aware.
- The CLI remains the source of truth for workflow actions; models edit spec bodies directly from the template after CLI creation.

## Applicable Decision Records

- DR-0003 Webview UI uses Lit and @floating-ui/dom
- DR-0004 Webview file layout follows the apps/providers split
- DR-0005 Webviews enforce a strict nonce-based CSP
- DR-0008 Extension <-> webview messages use typed discriminated unions
- DR-0012 Sundial workflows live in the CLI-backed store
- DR-0016 CLI store operations avoid runtime dependencies and shell pipelines
- DR-0025 CLI surface changes require version review
- DR-0027 Governance sidebars refresh on store file changes

## Applicable Research Notes

- None.

## Planned Approach

- Add `sundial/specs/workflow.yml` with default lanes: Backlog, Todo, Active, Done.
- Add CLI workflow commands:
  - `sundial spec create --title <title> [--status <lane>]`
  - `sundial spec list`
  - `sundial spec show <id>`
  - `sundial spec status <id> <lane>`
  - `sundial spec delete <id>`
  - `sundial spec lanes`
- Generate spec markdown from a fixed template and let the model edit section bodies directly.
- Generate board views by scanning canonical spec markdown files; do not keep `board.md` as a source-of-truth artifact.
- Add a main editor-area Specs Board webview panel, launched from the Specs sidebar/command palette, with lane columns, draggable spec cards, add, delete, and open-source actions.
- Route board mutations through CLI commands; keep the webview as UI over CLI-backed operations.

## Rejected Alternatives

- Use an external Markdown Kanban extension as the long-term primary board UX: rejected because it cannot create or navigate Sundial task artifacts with first-class semantics.
- Store all cards inside `board.md`: rejected because it hurts agent retrieval precision/recall and creates a second workflow source of truth.

## Test Plan

- CLI unit tests cover default lanes, custom YAML lanes, spec creation, status updates, deletion, listing, showing, and generated board links.
- Store bootstrap tests cover creation of `sundial/specs/workflow.yml` without creating `board.md`.
- VS Code unit tests verify the Specs sidebar reads individual spec markdown files.
- VS Code unit tests cover the Specs Board webview message contract and manifest command contribution.
- VS Code integration tests should not depend on an external Markdown Kanban extension being installed or enabled.

## Open Questions

- Should the embedded board write ordering metadata, or derive ordering from filesystem/title/status only?
- Should spec tasks be separate files under `sundial/specs/<spec-id>/tasks/` or peer `SPEC-####` files?
- Should `sundial spec status` be renamed to `sundial spec move` when board ordering exists?

## Implementation Log

- Added CLI-backed spec creation and status updates.
- Added YAML workflow configuration with default lanes.
- Added generated board rendering from canonical spec artifacts.
- Removed `board.md` from the store contract; spec markdown files are the source of truth.
- Updated the interim VS Code Specs sidebar to scan spec markdown files directly.
- Added `sundial spec delete` for CLI-owned spec removal.
- Added a main editor-area Specs Board webview panel with lanes, draggable cards, add, delete, and open-source actions.
- Fixed the board Add action by using a native form submit button instead of a custom element inside the form.
- Replaced the per-card move dropdown with drag and drop between lanes; drops still route through `sundial spec status`.
- Created this spec through `sundial spec create`.

## Test Log

- `npm --workspace packages/cli run test:unit` passed after removing physical board generation.
- `npm --workspace packages/vscode run test:unit` passed after switching Specs to individual spec files.
- `npm --workspace packages/cli run compile` passed.
- `npm --workspace packages/vscode run compile` passed.
- `npm --workspace packages/cli run test:unit` passed after adding `sundial spec delete`.
- `npm --workspace packages/vscode run test:unit` passed after adding the main editor Specs Board panel.
- A regression test first confirmed the Add action bug by failing on `<cs-button type="submit">`; after the fix, `npm --workspace packages/vscode run test:unit` passed.
- `npm --workspace packages/vscode run test:unit` passed after replacing the move dropdown with drag and drop.
- `npm --workspace packages/vscode run compile` passed after replacing the move dropdown with drag and drop.
- `node packages/cli/dist/main.js --cwd /Users/bjackson/codesteward spec board` rendered the board projection from `SPEC-0001`.
