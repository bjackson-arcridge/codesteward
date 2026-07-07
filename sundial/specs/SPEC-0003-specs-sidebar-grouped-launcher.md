---
id: SPEC-0003
title: Specs sidebar grouped launcher
status: Backlog
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

## Applicable Research Notes

- None.

## Planned Approach

- Extend workflow configuration so each status can define sidebar ordering and Kanban visibility.
- Use the configured order for sidebar groups; the intended default order is `Active`, `Todo`, `Backlog`, `Done`, then `Archive`.
- Keep `Archive` available as a sidebar group when configured for sidebar visibility, while excluding it from Kanban lanes when Kanban visibility is false.
- Replace the small title-bar Specs board icon with a prominent `Open Kanban View` button at the top of the Specs sidebar.
- Keep the `sundial.specs.openBoard` command available in the Command Palette even if the view-title entry point is removed.
- Render specs under their configured status group by title, with row-level actions remaining local to each row.
- Refresh the sidebar when spec markdown files or workflow configuration changes.
- Route any sidebar action that mutates spec state through the CLI.

## Rejected Alternatives

- Keeping only the compact title-bar icon for opening the board. Rejected because the board is now a primary workflow surface.
- Hard-coding sidebar group order in the VS Code client. Rejected because workflow ordering is configuration-owned.
- Rendering the full Kanban board inside the sidebar. Rejected because the sidebar is too constrained for board interactions.

## Test Plan

- Add CLI/core tests for parsing sidebar order and Kanban visibility from workflow configuration.
- Add sidebar webview unit coverage for the large `Open Kanban View` button.
- Add sidebar webview unit coverage for configured group ordering.
- Add sidebar webview unit coverage for statuses visible in the sidebar but hidden from Kanban lanes.
- Add package manifest coverage that removing the title-bar icon does not remove Command Palette access.
- Add extension-host coverage that sidebar refreshes on spec file and workflow configuration changes.

## Open Questions

- Should sidebar group collapsed/expanded state persist per workspace?
- Should empty configured groups render in the sidebar, or only groups with at least one spec?
- Should sidebar ordering and Kanban ordering use the same status list with per-view visibility, or separate `sidebar` and `kanban` order blocks?

## Implementation Log

- 2026-07-07: Created this planning spec.

## Test Log
