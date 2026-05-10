---
id: DR-0015
title: Bundle Lit webviews with the webview tsconfig
status: accepted
domain: vscode.webview.ui
created: 2026-05-05
tags:
  - build
affected_files:
  - packages/vscode/esbuild.js
  - packages/vscode/tsconfig.webview.json
updated: 2026-05-05
author: bjackson
---
## Decision

Lit webview bundles must use `tsconfig.webview.json` so esbuild preserves the decorator semantics used by the components. Configure browser webview bundling with the webview tsconfig whenever Lit components use decorators; typechecking that config is not enough.

## Appendix

Lit components rely on TypeScript's experimental decorators with `useDefineForClassFields: false`, and esbuild reads those settings from the tsconfig it's pointed at when it bundles. Bundling against the root tsconfig (which has different target and class-field semantics) typechecks fine but silently breaks decorator behavior at runtime — this DR exists because that exact failure mode has happened in this repo.
