# Sundial Vocabulary

Domains are broad applicability scopes. Use lowercase dot-separated hierarchy paths. A domain query matches ancestors, the exact domain, and descendants, but not sibling branches.

Tags are concern filters used within matching domains. Apply every applicable tag when it helps retrieval; omit tags only when a DR should match every tag query in its domain.

## Domains

### all

Global guidance that applies across the project.

### cli

Sundial command-line behavior and CLI-owned workflows.

### cli.bootstrap

LLM bootstrap execution, subprocess invocation, sandboxing, and related operator feedback.

### governance

Sundial governance lifecycle, store ownership, candidate review, and accepted DR retrieval behavior.

### governance.dr-lifecycle

Candidate DR creation, acceptance, rejection, supersession, and lifecycle metadata.

### governance.dr-retrieval

Accepted DR retrieval, context rendering, vocabulary filtering, and deterministic lookup behavior.

### governance.review

Decision-aware review mechanisms and escalation policy.

### vscode

VS Code extension work across extension host and webview surfaces.

### vscode.extension

VS Code extension-host behavior, commands, sidebar providers, integration harnesses, and extension packaging.

### vscode.webview

VS Code webview host/client boundaries, CSP, message protocols, asset loading, and webview bundling.

### vscode.webview.ui

Webview client UI components, styling, theming, accessibility, and interaction behavior.

## Tags

### accessibility

Keyboard navigation, ARIA roles, focus management, and contrast/visibility behavior across themes.

### boundary-types

Typed boundaries between processes or worlds: discriminated unions, runtime guards, and extension-to-webview message contracts.

### build

Bundling, tsconfig, decorator semantics, and other compile or transform behavior of shipped artifacts.

### dependencies

Approved third-party libraries and rules limiting which libraries can be introduced for a given concern.

### file-layout

Directory and module placement conventions that constrain where code lives.

### security

Security boundaries: CSP, sandbox flags, handling of untrusted content, and protections that contain malicious or accidental code execution.

### subprocess

Spawning, sandboxing, and consuming output from child processes.

### testing

Test harness, fixtures, diagnostics, and the boundary between test instrumentation and shipped behavior.

### theming

VS Code design tokens, color/font sourcing, and behavior across light, dark, and high-contrast themes.

### ui-pattern

Interaction patterns: per-item actions, popovers, quick-pick usage, sidebar layout, and the modality of common UI flows.
