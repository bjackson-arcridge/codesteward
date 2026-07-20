---
id: RES-0006
title: VS Code WebviewView collapse surface
domain: vscode.extension
summary: VS Code 1.118 exposes expansion visibility and reveal operations for WebviewView, but no public operation that collapses a view or its sibling views. Load this when implementing multi-section native sidebar layout behavior.
created: 2026-07-20
updated: 2026-07-20
---

## Research

In the VS Code 1.118 API declaration, `vscode.WebviewView` exposes:

- `readonly visible: boolean`, which is true when the view is on screen and expanded;
- `readonly onDidChangeVisibility: Event<void>`, which fires when the view is collapsed or expanded and when its view group changes;
- `show(preserveFocus?: boolean): void`, which reveals the view and expands it if collapsed.

The interface has no public `hide`, `collapse`, `setExpanded`, or sibling-layout method. Local reference: `node_modules/@types/vscode/index.d.ts`, interface `WebviewView` near line 10212 in the dependency version installed on 2026-07-20.

VS Code's implementation creates the extension-facing `WebviewView` wrapper in `WebviewViewPane.activate()`. Its `show` member delegates to `IViewsService.openView(this.id, !preserveFocus)`. It does not forward the underlying pane's internal expansion setter. Official source inspected on 2026-07-20: https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/webviewView/browser/webviewViewPane.ts

The native view container's `openView(id, focus?)` calls `view.setExpanded(true)` only for the requested view. The container has internal pane expansion state, but the extension-facing API does not expose it. Official source inspected on 2026-07-20: https://github.com/microsoft/vscode/blob/main/src/vs/workbench/browser/parts/views/viewPaneContainer.ts

A command inventory from the pinned project runtime, VS Code 1.118.1, included per-view generated commands ending in `.focus`, `.open`, `.removeView`, `.resetViewLocation`, and `.toggleVisibility`. It included no generic view-collapse or view-maximize command. The source implementation of `toggleViewVisibility(viewId)` changes whether the view descriptor is present in the container; it is distinct from collapsing the pane body.

This note is version-specific. A later VS Code API or command inventory may add a supported collapse operation.
