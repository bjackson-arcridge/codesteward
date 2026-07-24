# Sundial

Sundial turns project decisions, research notes, and implementation specs into durable context for AI coding agents. It keeps that context in plain Markdown inside your repository, then gives VS Code a focused activity bar for reviewing and maintaining it.

Marketplace id: `arcridge.sundial`.

## Why Use Sundial

AI coding sessions move faster when the agent can see the project rules: architectural decisions, rejected approaches, domain vocabulary, workflow notes, and research that should not be rediscovered every time. Sundial makes that memory explicit, reviewable, and version-controlled.

## Features

The Sundial documents bar adds a sidebar with sections capturing the types of sundial documents.

* **Domains**: Sundial groups decision records and research in a domain (think UI vs Backend) taxonomy; This provides high-level filtering on what documents are put into context for each task.
- **Decision Records**: Decision Records are durable reminders to the agent of general decisions and patterns to apply to the project.
    **Accepted DRs**  Filter by domain, open a rendered preview, edit source Markdown, disable stale guidance, or retire a record.
 .  **Candidates**: review proposed DRs, preview or edit the source, accept candidates into approved records, reject them with a reason, retire them, or dismiss throwaway proposals.
 .  **Rejected and Retired DRs**:
- **Research**: Captures research on programmatic boundaries or dependency behaviors; make durable so the same research can be applied when implmenting multiple features; or just to record project assumptions.
- **Specs**: A way to organize agent workstreams; lightweight spec driven development.
 * **Workflow** Specs flow through Backlog, Todo, Active, Done, and Archived states.
 * **Template** Customize `sundial/templates/spec.md` from the Specs sidebar. New specs substitute `{{id}}`, `{{title}}`, `{{status}}`, `{{created}}`, `{{updated}}`, and `{{created_by}}` while Sundial adds workflow frontmatter.
 * **Worktree Management:** Specs are a worktree management and navigation plane: create managed worktrees, open an associated worktree, return to the primary checkout, and automate merging and cleanup.
 * **Specs Board**: Offers a kanban-style view of specs as cards on a board.
The extension watches `sundial/decisions`, `sundial/research`, and `sundial/specs` so the sidebar refreshes when files change outside VS Code, including changes made by terminal commands or agent runs.

## Decisions as Code
Sundial is built around a project-local store, not a hosted service.  By default projects markdown managed by sundial lives in the `sundial` directory in the repo:

- `sundial/decisions/accepted/` stores approved Decision Records that agents should follow.
- `sundial/decisions/candidates/` stores proposed decisions waiting for human review.
- `sundial/decisions/rejected/` and `sundial/decisions/retired/` preserve decision history.
- `sundial/research/` stores longer reference notes that agents can retrieve later.
- `sundial/specs/` stores living implementation specs and `workflow.yml` for spec lanes.
- `sundial/templates/spec.md` stores the customizable body template used for new specs.
- `sundial/domains.md` keeps the project domain vocabulary visible in source control.

## Agent Skills

Sundial installs skills during project initialization to guide agent harnesses on how to use and update the decisions and research in the `sundial` directory.

## Getting Started

1. Open a workspace in VS Code.
2. Open the Sundial activity bar.
3. Install the Sundial CLI from the welcome view (if prompted).
4. Initialize the project and choose Claude Code, Codex, or both.

## What is a good set of domains?

If VS Code cannot find the CLI on `PATH`, set `sundial.cliPath` to the executable you want the extension to use.

## Recommended Extensions

Sundial keeps its records in Markdown so they stay easy to review, diff, and edit. These companion extensions make that editing loop more comfortable:

- **Markdown Inline Editor** by CodeSmith: edit Markdown with a more direct, document-like visualization of headers and bullets.

## Commands

Sundial contributes these user-facing commands:

- `Sundial: Install CLI`
- `Sundial: Show Diagnostics`
- `Sundial: Filter Decision Records by Domain`
- `Sundial: Clear Decision Record Filters`
- `Sundial: Open Decision Record Preview`
- `Sundial: Edit Decision Record Source`
- `Sundial: Filter Research by Domain`
- `Sundial: Clear Research Filters`
- `Sundial: Open Research Preview`
- `Sundial: Edit Research Source`
- `Sundial: Customize Spec Template`
- `Sundial: Open Specs Board`
- `Sundial: Open Spec`
- `Sundial: Open Candidate Preview`
- `Sundial: Edit Candidate Source`
- `Sundial: Accept Candidate`
- `Sundial: Reject Candidate`
- `Sundial: Retire Candidate`
- `Sundial: Dismiss Candidate`
