---
id: SPEC-0002
title: Specs archive workflow
status: Archive
created: 2026-07-07
updated: 2026-07-07
created_by: bjackson
---
# Specs archive workflow

## Discovery

- Specs are individual markdown files under `sundial/specs/`; there is no generated `board.md` source of truth.
- Workflow state is currently read from spec frontmatter and updated through `sundial spec status`.
- `Archive` should be a real status so archived specs remain queryable and recoverable.
- `Archive` is not a normal Kanban swim lane; it is a terminal/hidden board status reached by an archive card action.
- Delete remains a separate user-facing option for intentionally removing a spec; archive is additive and does not replace delete.
- Kanban lane visibility should be driven by workflow configuration, so hidden statuses are not hard-coded into the webview.
- Visibility controls only affect whether a spec appears in a particular workflow surface; any spec that can be opened remains editable.

## Applicable Decision Records

- DR-0003 Webview UI uses Lit and @floating-ui/dom.
- DR-0004 Webview file layout follows the apps/providers split.
- DR-0005 Webviews enforce a strict nonce-based CSP.
- DR-0006 Webview UI meets baseline accessibility requirements.
- DR-0007 Webview styling uses only `--vscode-*` design tokens.
- DR-0008 Extension <-> webview messages use typed discriminated unions.
- DR-0012 Sundial workflows live in the CLI-backed store.
- DR-0016 CLI store operations avoid runtime dependencies and shell pipelines.
- DR-0025 CLI surface changes require version review.
- DR-0027 Governance sidebars refresh on store file changes.

## Applicable Research Notes

- None.

## Planned Approach

- Extend `sundial/specs/workflow.yml` from a simple lane list toward ordered status entries that can express board visibility.
- Add `Archive` as a configured status with `kanban.visible: false`.
- Keep individual spec markdown files as the only durable source of truth for status.
- Ensure CLI status validation accepts hidden configured statuses such as `Archive`.
- Keep `Archive` included in unfiltered `sundial spec list` output.
- Add CLI status filtering so users can list only specs in a selected status.
- Add an archive action to board cards that routes through the extension host and runs the CLI-backed status update.
- Keep delete available as a distinct destructive action with existing confirmation/guard behavior.
- Use an archive-style icon button for the action, with an accessible label and no color literals.
- Keep archived specs out of Kanban swim lanes while preserving access from CLI listing and any configured sidebar group.

## Rejected Alternatives

- Replacing delete with archive. Rejected because users still need an explicit destructive removal action; archive only adds a reversible workflow state.
- Hard-coding `Archive` as a special webview-only case. Rejected because workflow visibility belongs in configuration.

## Test Plan

- Add CLI unit coverage for workflow configuration that includes a hidden `Archive` status.
- Add CLI unit coverage that `sundial spec status <id> Archive` updates frontmatter successfully.
- Add CLI unit coverage that unfiltered spec listing includes archived specs.
- Add CLI unit coverage for filtering spec list output by status.
- Add regression coverage that delete remains available independently from archive.
- Add webview unit coverage that hidden statuses do not render as Kanban swim lanes.
- Add webview unit coverage that the archive action posts the expected typed move/status message.
- Add extension-host coverage that archive actions delegate to the CLI rather than editing status in the extension.

## Open Questions

- Resolved: workflow configuration includes `sidebar.visible`; the VS Code specs sidebar honors it even though current project workflow keeps archived specs sidebar-visible.

## Implementation Log

- 2026-07-07: Created this planning spec.
- 2026-07-07: Clarified that archive is additive and does not replace delete.
- 2026-07-07: Resolved visibility/listing questions: Archive uses `kanban.visible: false`, remains in unfiltered CLI lists, and should be list-filterable by status.
- 2026-07-07: Implemented `statuses:` workflow entries with `kanban.visible` and `sidebar.visible`.
- 2026-07-07: Added `Archive` as a hidden Kanban status in the default and project workflows.
- 2026-07-07: Added `sundial spec list --status <status>` filtering and hidden-status status updates.
- 2026-07-07: Added a specs board archive action that sends a typed `move` message to `Archive`; delete remains a separate action.

## Test Log

- 2026-07-07: `npm --workspace packages/cli run test:unit`
- 2026-07-07: `npm --workspace packages/vscode run test:unit`
