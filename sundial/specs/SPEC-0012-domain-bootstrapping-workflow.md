---
id: SPEC-0012
title: Domain Bootstrapping Workflow
status: Backlog
created: 2026-07-24
updated: 2026-07-24
created_by: bjackson
---

# Domain Bootstrapping Workflow

When a user first bootstraps sundial in a project, they need to set up their domains.

(1) We want a domains section in the accordion sidebar, where the user can edit, add, remove their domains. This is the top-most section.
(2) Domains are always stored/presented lexicographically sorted.
(3) We want a default set of possible domains to hint to the user what domains look like, so when the user clicks +, it has a name and a description field the user can type in, and beneath that a list of default fields, filtered by domains already in the user's domain list.


## Discovery

- The canonical vocabulary is `sundial/domains.md`. Its `## Domains` section contains `### <name>` entries followed by descriptions. The CLI parser validates lowercase dot-separated kebab-case names and duplicates, but it currently preserves file order rather than canonicalizing it.
- `sundial domains` is currently read-only. Candidate acceptance can append a proposed domain through `acceptDomainProposals`, but that append path does not sort the section.
- The VS Code extension directly parses domain names for record/research filters. It does not expose descriptions or a domain mutation surface.
- The initialized sidebar is one `WebviewView` containing a Lit accordion with a fixed section union and persisted active/visible state. Adding a section therefore requires coordinated host/client protocol, provider, persistence-migration, and keyboard-navigation changes.
- The governance watcher covers decisions, research, and specs, but not `sundial/domains.md`; external domain changes currently cannot refresh a sidebar surface or its filter options.
- The current CLI intentionally has no top-level `bootstrap` command. The manual setup experience in this spec works immediately after `sundial init` and does not depend on the separate candidate proposal to restore LLM-assisted domain bootstrap.
- The repository supports multiple initialized workspace folders. Domain mutations must target one store rather than merging distinct vocabularies into one editable list.

## Applicable Decision Records

- DR-0003: implement the domain client as Lit and use only the approved positioning dependency if an anchored overlay is needed.
- DR-0004: keep the extension-host provider under `src/webviews/domains/`, the client under `src/webviews/apps/domains/`, and cross the boundary only through messages.
- DR-0005: render the domain surface through the shared nonce-based CSP helper with only local bundled assets.
- DR-0006: provide semantic controls, visual-order keyboard access, Escape cancellation, focus restoration, and labels for icon-only actions.
- DR-0007: use only VS Code design tokens or `color-mix()` over those tokens.
- DR-0008: use typed discriminated host/client unions, runtime guards, and exhaustive dispatch for domain and main-sidebar messages.
- DR-0009: keep Domains inside the existing main sidebar `WebviewView`.
- DR-0010: keep edit and remove actions on each domain row; do not route per-domain actions through `showQuickPick`.
- DR-0012: put domain add/update/remove behavior in the CLI-backed store layer; the extension invokes the CLI and refreshes.
- DR-0013: preserve deterministic domain-first vocabulary behavior.
- DR-0016: implement parsing, validation, reference checks, and Markdown writes with Node standard-library APIs and in-repo parsers.
- DR-0017, DR-0026, and DR-0032: use staged scenario workspaces, compile local CLI `dist`, and run integration coverage with the verified project-managed VS Code runtime.
- DR-0025: review and bump the CLI package version for the expanded public `domains` surface.
- DR-0027: refresh governance views after both extension-owned and external domain-file mutations.
- DR-0031: always mutate the canonical `<root>/sundial/domains.md`, regardless of the configured target folder.

## Applicable Research Notes

- None. This plan relies on project-owned contracts and accepted Decision Records; no external API research was required.

## Planned Approach

### 1. Make domain vocabulary writes canonical

- Extend `packages/cli/src/core/domains.ts` with one canonical section renderer and add/update/remove operations. Preserve the document preamble and any sections outside `## Domains`, but replace the domain definitions as a normalized block.
- Sort definitions by their restricted ASCII names in deterministic ascending lexical order after every managed write. Return parsed/listed definitions in that order as well, so legacy hand-edited unsorted files are presented consistently.
- Route `acceptDomainProposals` through the same writer so accepting a candidate cannot reintroduce append order.
- Keep reads non-mutating. An existing unsorted file becomes canonical on its next CLI-owned domain mutation rather than being silently rewritten when listed or when the extension opens.
- Require a valid name and a non-empty, trimmed, single-line description. Reject duplicates. Continue using the existing lowercase dot-separated kebab-case grammar.
- Treat `all` as the permanent virtual/root domain: its description may be updated, but its name cannot be changed and it cannot be removed.
- Before renaming or removing a domain, scan `domain` frontmatter in candidate, accepted, rejected, and retired Decision Records plus research notes. Refuse the mutation with actionable referencing paths if the exact domain is in use. Do not cascade rewrites through authored governance files.

### 2. Expand the CLI-owned domain workflow

- Keep bare `sundial domains` as the human-readable sorted list and add:
  - `sundial domains --json`
  - `sundial domains add --name <name> --description <description>`
  - `sundial domains update <current-name> [--name <new-name>] [--description <description>]`
  - `sundial domains remove <name>`
- Require at least one changed field for `update`, use usage exit code `64` for malformed invocations, and use failure exit code `1` for invalid or unsafe store mutations.
- Make `--json` return a versioned object containing the selected workspace's sorted domain definitions, per-domain exact reference count, and filtered suggestions. The VS Code host parses and validates this contract rather than duplicating the Markdown grammar.
- Keep human mutation output concise and include the resulting domain name. The extension refreshes state after each successful command instead of depending on mutation-specific JSON output.
- Define the initial suggestion catalog in the CLI core so future adapters receive the same product vocabulary:
  - `api` — Public and internal API contracts and behavior.
  - `cli` — Command-line behavior and CLI-owned workflows.
  - `data` — Data models, persistence, migrations, and storage.
  - `docs` — User and developer documentation.
  - `governance` — Project policy, lifecycle, and decision workflows.
  - `infrastructure` — Build, deployment, hosting, and operations.
  - `security` — Authentication, authorization, privacy, and security controls.
  - `testing` — Test strategy, harnesses, fixtures, and quality gates.
  - `ui` — User-interface architecture and interaction behavior.
- Filter suggestions by exact names already present and return the remainder lexicographically sorted. Keep the form hint explicit that nested names such as `ui.accessibility` are supported.

### 3. Add a dedicated Domains sidebar provider

- Add typed domain messages and a `DomainsWebviewProvider` under `packages/vscode/src/webviews/domains/`. Its state includes workspace choices, the selected workspace, definitions, usage counts, suggestions, busy state, and an optional inline error.
- Load state through `sundial domains --json`. Route add/update/remove messages to the corresponding CLI command with argument arrays and the selected store root, then reload the provider state.
- When more than one initialized workspace exists, render a workspace selector at the top of Domains and keep all rows and mutations scoped to that selection. Automatically select the only store in a single-root workspace.
- Add `domains` as the first member of the main sidebar section order and as a specialized section app/provider, rather than coercing domains into the records component.
- Default new sidebar state to Domains as the active section so first-time users land on setup. Version the persisted sidebar state, migrate the legacy unversioned state exactly once by inserting Domains at the front while preserving the user's current active section and existing visibility choices, and honor an intentional Domains hide in the new state version. After migration, Domains participates in the same show/hide context menu as other sections.
- Include `sundial/domains.md` in the store watcher. A create/change/delete refreshes Domains plus record and research filter options, covering terminal/agent edits as well as extension-owned commands.

### 4. Build the add, edit, and remove interactions

- Add a Lit `cs-domains-app` under `packages/vscode/src/webviews/apps/domains/` and import it into the existing main-sidebar bundle, which already builds with `tsconfig.webview.json`; do not add an unused standalone view contribution.
- Render sorted rows with the domain name, description, usage status, and row-local edit/remove icon buttons. Disable rename/remove for `all`, disable rename/remove when the exact usage count is nonzero, and continue allowing description edits.
- Put an accessible `+` action at the top of the section. It opens an inline form with name and description fields, then the filtered suggestion list beneath them.
- Make selecting a suggestion populate both form fields for review; it does not immediately mutate the store. Keep custom entry available at all times.
- Reuse the inline form for edits, prefilled from the selected row. Submit with the keyboard or explicit Save, cancel with Escape or Cancel, restore focus to the invoking control, and keep validation errors adjacent to the form.
- Ask for confirmation before remove, then let the CLI recheck references to protect against stale UI state. Show reference-blocking failures without dropping the user's current section or workspace selection.
- Use semantic lists/forms/buttons, visible focus treatment, `aria-expanded`/`aria-controls` where applicable, and VS Code theme tokens in light, dark, high-contrast, and high-contrast-light themes.

### 5. Keep docs, versions, and diagnostics aligned

- Document domain listing and mutations in the CLI README/help, and document the Domains setup section in the VS Code README.
- Extend integration-only diagnostics with the selected workspace, rendered domain count, suggestion count, and add/edit form visibility so staged scenarios can assert behavior without DOM injection.
- Because this adds public functionality to both independently versioned packages, increment the CLI and VS Code extension minor versions from their implementation-time baselines and update the root lockfile.

## Rejected Alternatives

- Let the webview or extension host edit `domains.md` directly: rejected because domain lifecycle mutations belong in the CLI-backed store and would otherwise be implemented differently by each adapter.
- Reuse the generic records component for Domains: rejected because domain CRUD, suggestions, protected roots, workspace selection, and inline forms have a different state and action model.
- Hard-code suggestions only in the Lit client: rejected because other adapters would not share the same defaults and the list could drift from CLI validation.
- Save a suggestion immediately when clicked: rejected because users should be able to review or customize its name and description before mutating the store.
- Cascade domain renames/removals through Decision Records or research notes: rejected because those are authored governance artifacts; an explicit blocked operation is safer than broad automatic rewrites.
- Normalize the file during a read-only list or sidebar load: rejected because opening the UI must not unexpectedly rewrite a hand-editable store file.
- Make LLM-assisted bootstrap the only setup path: rejected because users need deterministic manual control even when no supported agent provider is installed.

## Test Plan

- CLI core/unit coverage:
  - parse and canonically render valid definitions while preserving non-domain document content;
  - sort add, update, remove, init defaults, and accepted candidate proposals lexicographically;
  - present a legacy unsorted file sorted without rewriting it until a mutation;
  - validate names/descriptions, duplicates, missing update fields, unknown targets, and protected `all` operations;
  - block rename/remove for exact references across every Decision Record lifecycle and research notes, with actionable paths;
  - return stable versioned JSON, usage counts, and filtered/sorted suggestions;
  - cover help, quiet mode, exit codes, configured-folder store discovery, and human output.
- VS Code unit coverage:
  - validate every domain and main-sidebar host/client message variant and reject malformed payloads;
  - parse the CLI JSON contract and route add/update/remove with the selected root and argument arrays;
  - verify Domains is first, new users start there, and existing persisted sidebar state migrates without losing its active section;
  - verify sorted rows, add/edit form behavior, suggestion population/filtering, protected-root controls, removal confirmation, focus restoration, and inline errors;
  - verify semantic/ARIA hooks, keyboard behavior, token-only styling, `tsconfig.webview.json` bundling, and the expanded domain-file watcher.
- Staged VS Code integration coverage:
  - initialize a project and verify the Domains section is the first/default setup surface;
  - add, edit, and remove an unreferenced domain through the compiled local CLI path and verify the canonical file plus refreshed UI diagnostics;
  - verify a referenced domain cannot be renamed or removed;
  - externally edit `domains.md` and verify Domains and filter options refresh;
  - verify workspace selection keeps mutations isolated in a multi-root fixture.
- Run the broad regression set after implementation: `npm run check-types`, `npm run lint`, `npm run test:unit`, and elevated `npm test`.

## Open Questions

- None. Resolved for this scope:
  - `all` is permanent, but its description is editable.
  - Domain rename/removal is blocked while exact references exist; there is no cascading governance rewrite.
  - Suggestions populate the form for review rather than saving immediately.
  - Existing users retain their active sidebar section during migration; newly initialized users start in Domains.
  - LLM-assisted bootstrap may coexist later, but this manual workflow has no dependency on it.

## Implementation Log

- 2026-07-24: Planned canonical CLI domain mutations, a CLI-owned suggestion catalog, a dedicated top-most Domains accordion section, safe reference checks, multi-root targeting, refresh behavior, accessibility, and regression coverage.

## Test Log

- Planning phase only; no product code or test suites were run.
