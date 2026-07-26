# Sundial

Sundial turns project decisions, research notes, and implementation specs into durable context for AI coding agents. It keeps that context in plain Markdown inside your repository, then gives VS Code a focused activity bar for reviewing and maintaining it.

Marketplace id: `arcridge.sundial`.

## Why Use Sundial

AI coding sessions move faster when the agent can see the project rules: architectural decisions, rejected approaches, domain vocabulary, workflow notes, and research that should not be rediscovered every time. Sundial makes that memory explicit, reviewable, and version-controlled.

## Features

The Sundial documents bar adds a sidebar with sections for each type of Sundial document.

- **Domains**: The first sidebar section lists the selected project's sorted vocabulary. Add custom or suggested domains, edit descriptions or unreferenced names, and remove unreferenced domains without leaving VS Code.
- **Decision Records**: Decision Records are durable reminders to the agent of general decisions and patterns to apply to the project.
  - **Accepted DRs**: Filter by domain, open a rendered preview, edit source Markdown, disable stale guidance, or retire a record.
  - **Candidates**: Review proposed DRs, preview or edit the source, accept candidates into approved records, reject them with a reason, retire them, or dismiss throwaway proposals.
  - **Rejected and Retired DRs**: Preserve decision history for future reference.
- **Research**: Captures research on programmatic boundaries or dependency behavior so it can inform multiple features and preserve project assumptions.
- **Specs**: Organizes agent workstreams through lightweight, spec-driven development.
  - **Workflow**: Specs flow through Backlog, Todo, Active, Done, and Archived states.
  - **Template**: Customize `sundial/templates/spec.md` from the Specs sidebar. New specs substitute `{{id}}`, `{{title}}`, `{{status}}`, `{{created}}`, `{{updated}}`, and `{{created_by}}` while Sundial adds workflow frontmatter.
  - **Worktree Management**: Specs are a worktree-management and navigation plane: create managed worktrees, open an associated worktree, return to the primary checkout, and automate merging and cleanup.
  - **Specs Board**: Offers a kanban-style view of specs as cards on a board.

The extension watches `sundial/domains.md`, `sundial/decisions`, `sundial/research`, and `sundial/specs` so the sidebar refreshes when files change outside VS Code, including changes made by terminal commands or agent runs.

## Documentation as Code

Sundial is built around a project-local store, not a hosted service. By default, project Markdown managed by Sundial lives in the repository's `sundial` directory:

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
5. Open the Domains section, choose a workspace when prompted, and use `+` to review a suggested domain or enter a custom lowercase dot-separated name.

If VS Code cannot find the CLI on `PATH`, set `sundial.cliPath` to the executable you want the extension to use.

## What is a good set of domains?

Domains serve two purposes. First, the UI can filter artifacts by domain, making domains an organizational tool. Second, agents are prompted to query only the domains relevant to the task at hand.

Domains should partition the project into separable concerns such as `ui`, `api`, and `backend`. Start with a few high-level domains; in practice, overly fine-grained domains do not improve filtering. The sidebar suggests common starting points such as `api`, `cli`, `data`, `docs`, `security`, `testing`, and `ui`. Nested domains such as `ui.accessibility` can represent a focused branch while preserving its parent context.

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
