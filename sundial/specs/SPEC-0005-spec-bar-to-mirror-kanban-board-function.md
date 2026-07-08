---
id: SPEC-0005
title: Spec Bar to mirror kanban board function
status: Done
created: 2026-07-08
updated: 2026-07-08
created_by: bjackson
---
# Spec Bar to mirror kanban board function

## Discovery

Missing Functions:
(1) Add new card button
(2) Drag and drop to reassign status
(3) Delete icon

- The Specs board already implements all three behaviors in `cs-specs-board-app`: create via a toolbar form, drag/drop lane reassignment via typed `move` messages, and row actions for archive/delete.
- The Specs sidebar currently acts as a grouped launcher/list through `RecordsApp` in `actionMode: 'specs'`; it exposes open/edit behavior and the `Open Kanban View` launcher, but does not expose create, status reassignment, or delete controls.
- The sidebar should mirror the board's practical workflow functions without becoming a cramped second Kanban board. It should remain a compact grouped sidebar surface from SPEC-0003.
- Spec mutations in the sidebar can reuse the extension-host paths currently named `createSpecFromBoard`, `moveSpecFromBoard`, and `deleteSpecFromBoard`; those helpers already delegate to the Sundial CLI and refresh both sidebar and board surfaces.
- Drag/drop in the sidebar should operate across status groups. Dropping a spec onto a different group should issue the same logical status change as dropping a board card onto a lane.
- `Backlog` is the intended sidebar create default when available.
- `Archive` is a valid sidebar drop target when it is sidebar-visible.
- Sidebar spec rows should use the title click as the open/edit action and expose only one card icon action: delete. Separate open/preview/edit icons are redundant for specs because the desired action is editing the markdown source.
- Deletion should keep the existing modal confirmation behavior from the board path before invoking `sundial spec delete`.
- Multi-root workspaces need to preserve the `workspace` field on create, move, and delete commands so sidebar actions mutate the correct store.

## Applicable Decision Records

- DR-0003 Webview UI uses Lit and `@floating-ui/dom`.
- DR-0004 Webview file layout follows the apps/providers split.
- DR-0005 Webviews enforce a strict nonce-based CSP.
- DR-0006 Webview UI meets baseline accessibility requirements.
- DR-0007 Webview styling uses only `--vscode-*` design tokens.
- DR-0008 Extension <-> webview messages use typed discriminated unions.
- DR-0009 Sidebar sections use `WebviewView`, not `TreeView`.
- DR-0010 VS Code per-item actions stay localized to the row, not in `showQuickPick`.
- DR-0012 Sundial workflows live in the CLI-backed store.
- DR-0014 Separate harness failures from product fixes.
- DR-0017 VS Code tests use staged scenario workspaces.
- DR-0019 Preserve Command Palette Access When Removing Local UI Entry Points.
- DR-0025 CLI surface changes require version review.
- DR-0026 VS Code scenarios compile local CLI dist.
- DR-0027 Governance sidebars refresh on store file changes.
- DR-0030 Spec workflow visibility lives in status metadata.

## Applicable Research Notes

- None.

## Planned Approach

- Extend the Specs sidebar typed message protocol in `packages/vscode/src/webviews/records/messages.ts` with specs-only commands:
  - `createSpec` with `title`, `status`, and optional `workspace`.
  - `moveSpec` with `id`, `status`, and optional `workspace`.
  - `deleteSpec` with `id` and optional `workspace`.
  - Diagnostics commands for exercising create, move, and delete through the sidebar webview in integration tests.
- Extend `RecordRenderDiagnostic` only with fields needed to assert the new sidebar controls render, such as add-form visibility and delete-action visibility.
- Update `RecordsApp` specs mode to render a compact add form beneath the `Open Kanban View` launcher:
  - Title input, status select, optional workspace select for multi-root, and an icon+text add button.
  - Status options should come from the same configured workflow/status set used for sidebar groups, not from hard-coded status names.
  - Default the status select to `Backlog` when `Backlog` is a visible sidebar status; otherwise fall back to the first visible sidebar status.
  - Submitting the form should send `createSpec` and reset the title field after a valid submission.
- Feed the sidebar enough state to create specs:
  - Add sidebar-visible status options and optional workspace options to the specs-mode state returned by `RecordsWebviewProvider`.
  - Source status ordering from the workflow-backed sidebar groups so create defaults align with the visible sidebar order.
- Add row-local spec actions in sidebar mode:
  - Remove the redundant open/preview icon from specs-mode rows.
  - Remove the redundant edit icon from specs-mode rows.
  - Keep the title click as the primary way to open the spec markdown source.
  - Add a delete icon action for each spec row in specs mode.
  - Do not add DR lifecycle actions to specs rows.
- Add drag/drop status reassignment in sidebar mode:
  - Make spec cards draggable only when `actionMode === 'specs'`.
  - Treat status group containers as drop targets.
  - On drop into a different group, send `moveSpec` with the target group status and the dragged spec id/workspace.
  - Allow dropping onto `Archive` when `Archive` is configured as a visible sidebar group.
  - Preserve keyboard and pointer basics: normal Tab order, visible focus, and no drag-only requirement for opening or deleting specs.
- Generalize the extension-host mutation helpers currently named `createSpecFromBoard`, `moveSpecFromBoard`, and `deleteSpecFromBoard` to spec-surface-neutral names, then call them from both the board and sidebar handlers.
- Keep all status changes, creation, and deletion CLI-backed through `sundial spec create`, `sundial spec status`, and `sundial spec delete`, satisfying DR-0012.
- Refresh both the Specs sidebar and Specs board after sidebar mutations so the two surfaces stay synchronized.
- Leave the command palette commands and the existing board launcher intact.

## Rejected Alternatives

- Rendering the full Kanban board inside the sidebar. Rejected because SPEC-0003 established the sidebar as a compact grouped launcher/list and the board as the main editor surface.
- Creating a second, sidebar-specific mutation implementation. Rejected because DR-0012 keeps workflow mutations CLI-backed, and the extension already has board mutation helpers that can be shared.
- Using `showQuickPick` for delete or move actions. Rejected because per-item actions should remain localized to rows or their containing groups per DR-0010.
- Keeping separate open/preview/edit icon actions on specs-mode rows. Rejected because the spec title click is already the open/edit action, so delete should be the only row icon.
- Adding status dropdowns to every sidebar card instead of drag/drop. Rejected for this pass because the requested parity is drag/drop reassignment; per-card dropdowns would add density.

## Test Plan

- Add unit coverage for `records/messages.ts` guards accepting/rejecting the new specs-mode create, move, delete, and diagnostic messages.
- Add `recordsApp` unit coverage that specs mode renders:
  - The compact add form.
  - Status options from host-provided spec status/group data, with `Backlog` selected by default when available.
  - Delete icon actions on spec rows, without redundant open/preview/edit icons.
  - Draggable spec cards and group drop handlers in specs mode.
- Add extension-host unit or source-level coverage that both board and sidebar route through shared spec mutation helpers rather than separate command paths.
- Add VS Code integration coverage using the staged `records-and-candidates` scenario:
  - Create a spec from the sidebar and verify it lands in `Backlog` by default.
  - Move a spec from one sidebar group to another, including `Archive`, and verify the status metadata changes.
  - Delete a spec from the sidebar through a diagnostics path that bypasses modal UI only in test mode, then verify the file/count changes.
  - Verify the board reflects sidebar-created or sidebar-moved specs after refresh/reveal.
- Run targeted tests during implementation:
  - `npm --workspace packages/vscode run test:unit`
  - `npm --workspace packages/vscode test`
- Because this is a VS Code feature touching sidebar, webview protocol, and integration behavior, run the broad regression set before finalizing:
  - `npm run check-types`
  - `npm run lint`
  - `npm run test:unit`
  - `npm test`

## Open Questions

- Resolved: The sidebar add form defaults to `Backlog` when `Backlog` is visible.
- Resolved: Sidebar drag/drop supports moving specs to `Archive` when `Archive` is sidebar-visible.
- Resolved: Specs-mode rows use title click for opening/editing and expose only a delete icon action; open/preview/edit icons are redundant and should be removed from this surface.

## Implementation Log

- 2026-07-08: Planned sidebar parity for add, drag/drop status reassignment, and delete while preserving the main board as the full Kanban surface.
- 2026-07-08: Resolved sidebar behavior details: create defaults to `Backlog`, `Archive` is a valid drop target, and spec rows show edit/delete actions only.
- 2026-07-08: Resolved sidebar row actions further: title click is the open/edit action, leaving delete as the only spec row icon.
- 2026-07-08: Implemented specs-sidebar typed create/move/delete commands, diagnostics hooks, status/workspace state, compact add form, delete-only row actions, drag/drop group reassignment, and shared CLI-backed spec mutation helpers for board and sidebar.
- 2026-07-08: Tightened the sidebar add form to one line with only a title input, optional workspace selector, and Add button. Create now defaults from `Backlog` or kanban lane order and opens the newly-created spec markdown source.

## Test Log

- 2026-07-08: `npm --workspace packages/vscode run test:unit` passed.
- 2026-07-08: `npm --workspace packages/vscode test` passed, including sidebar create, move-to-Archive, board refresh, and diagnostics delete coverage in the `records-and-candidates` scenario.
- 2026-07-08: Broad regression set passed: `npm run check-types`, `npm run lint`, `npm run test:unit`, and `npm test`. The first `npm test` attempt reached `vscode-test` and failed on sandboxed DNS for `update.code.visualstudio.com`; the escalated rerun passed.
- 2026-07-08: Follow-up compact add form/default-open tweak passed `npm --workspace packages/vscode run test:unit`, `npm --workspace packages/vscode test`, `npm run check-types`, `npm run lint`, and `npm run test:unit`.
