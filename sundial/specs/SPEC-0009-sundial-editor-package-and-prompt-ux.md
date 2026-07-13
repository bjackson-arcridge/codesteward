---
id: SPEC-0009
title: Sundial Editor package and prompt UX
status: Backlog
created: 2026-07-13
updated: 2026-07-13
created_by: bjackson
parent: SPEC-0008
domain: editor
slice: 1
---

# Sundial Editor package and prompt UX

## Discovery

This is functional slice 1 from SPEC-0008. It establishes the separate Sundial Editor VS Code extension package, per-keystroke saving, and the source-line-to-message-box prompt UX. Submitting a prompt stops at the UI boundary and does not yet contact an agent.

## Applicable Decision Records

- DR-0003 Webview UI uses Lit and @floating-ui/dom.
- DR-0004 Webview file layout follows the apps/providers split.
- DR-0005 Webviews enforce a strict nonce-based CSP.
- DR-0006 Webview UI meets baseline accessibility requirements.
- DR-0007 Webview styling uses only --vscode-* design tokens.
- DR-0008 Extension ↔ webview messages use typed discriminated unions.
- DR-0009 Sidebar sections use WebviewView, not TreeView.
- DR-0012 Sundial workflows live in the CLI-backed store.

## Applicable Research Notes

None identified for this initial scaffold.

## Planned Approach

## Rejected Alternatives

## Test Plan

## Open Questions

## Implementation Log

## Test Log
