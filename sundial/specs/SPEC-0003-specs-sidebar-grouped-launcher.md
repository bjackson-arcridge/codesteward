---
id: SPEC-0003
title: Specs sidebar grouped launcher
status: Done
created: 2026-07-07
updated: 2026-07-07
created_by: bjackson
---
# Specs sidebar grouped launcher

## Discovery

- The current Specs sidebar is too small for the Kanban board itself; the board belongs in the main editor area.
- The sidebar should act as navigation and lightweight workflow context, not as the full board surface.
- The small title-bar board icon should become a large `Open Kanban View` button at the top of the Specs section.
- Specs should be grouped by workflow status in the sidebar.
- Sidebar group order is controlled by workflow configuration rather than hard-coded in the webview.
- Kanban status visibility is also controlled by workflow configuration, so statuses can appear in the sidebar without becoming board swim lanes.

## Applicable Decision Records

- DR-0003 Webview UI uses Lit and @floating-ui/dom.
- DR-0004 Webview file layout follows the apps/providers split.
- DR-0005 Webviews enforce a strict nonce-based CSP.
- DR-0006 Webview UI meets baseline accessibility requirements.
- DR-0007 Webview styling uses only `--vscode-*` design tokens.
- DR-0008 Extension <-> webview messages use typed discriminated unions.
- DR-0009 Sidebar sections use WebviewView, not TreeView.
- DR-0010 VS Code per-item actions stay localized to the row, not in showQuickPick.
- DR-0012 Sundial workflows live in the CLI-backed store.
- DR-0019 Preserve Command Palette Access When Removing Local UI Entry Points.
- DR-0027 Governance sidebars refresh on store file changes.
- DR-0030 Spec workflow visibility lives in status metadata.

## Applicable Research Notes

- None.

## Planned Approach

- Extend workflow configuration with separate `kanban` and `sidebar` order blocks while status visibility remains status metadata.
- Use the configured `sidebar` order for sidebar groups; the intended default priority order is `Active`, `Todo`, `Backlog`, `Done`, then `Archive`.
- Use the configured `kanban` order for the board's classic workflow state order; the intended default order remains `Backlog`, `Todo`, `Active`, then `Done`.
- Keep `Archive` available as a sidebar group when configured for sidebar visibility, while excluding it from Kanban lanes when Kanban visibility is false.
- Replace the small title-bar Specs board icon with a prominent `Open Kanban View` button at the top of the Specs sidebar.
- Keep the `sundial.specs.openBoard` command available in the Command Palette even if the view-title entry point is removed.
- Render only sidebar groups that contain at least one spec.
- Persist sidebar group collapsed/expanded state per workspace.
- Render specs under their configured status group by title, with row-level actions remaining local to each row.
- Refresh the sidebar when spec markdown files or workflow configuration changes.
- Route any sidebar action that mutates spec state through the CLI.

## Rejected Alternatives

- Keeping only the compact title-bar icon for opening the board. Rejected because the board is now a primary workflow surface.
- Hard-coding sidebar group order in the VS Code client. Rejected because workflow ordering is configuration-owned.
- Rendering the full Kanban board inside the sidebar. Rejected because the sidebar is too constrained for board interactions.

## Test Plan

- Add CLI/core tests for parsing separate sidebar and Kanban ordering plus per-status visibility from workflow configuration.
- Add sidebar webview unit coverage for the large `Open Kanban View` button.
- Add sidebar webview unit coverage for configured group ordering.
- Add sidebar webview unit coverage for statuses visible in the sidebar but hidden from Kanban lanes.
- Add package manifest coverage that removing the title-bar icon does not remove Command Palette access.
- Add extension-host coverage that sidebar refreshes on spec file and workflow configuration changes.

## Open Questions

- Resolved: Sidebar group collapsed/expanded state persists per workspace.
- Resolved: Only groups containing at least one spec render in the sidebar.
- Resolved: Workflow configuration uses separate `sidebar` and `kanban` order blocks; Kanban keeps classic state order, while sidebar uses priority order `Active`, `Todo`, `Backlog`, `Done`, `Archive`.

## Implementation Log

- 2026-07-07: Created this planning spec.
- 2026-07-07: Resolved sidebar state persistence, empty group rendering, and separate sidebar/Kanban ordering.
- 2026-07-07: Implemented `kanban.order` and `sidebar.order` workflow blocks while keeping visibility on status metadata.
- 2026-07-07: Added grouped Specs sidebar rendering with a prominent `Open Kanban View` launcher and per-workspace collapsed group persistence.
- 2026-07-07: Removed the Specs view-title board button while preserving `sundial.specs.openBoard` command access.

## Test Log

- 2026-07-07: `npm --workspace packages/cli run check-types` passed.
- 2026-07-07: `npm --workspace packages/vscode run check-types` passed.
- 2026-07-07: `npm --workspace packages/cli run test:unit` passed.
- 2026-07-07: `npm --workspace packages/vscode run test:unit` passed.
- 2026-07-07: `npm run check-types` passed.
- 2026-07-07: `npm run lint` passed.
- 2026-07-07: `npm run test:unit` passed.
- 2026-07-07: `npm test` initially failed in the sandbox on DNS lookup for `update.code.visualstudio.com`; reran with approved network access and it passed.
