# Sundial

Sundial turns project decisions, research notes, and implementation specs into durable context for AI coding agents. It keeps that context in plain Markdown inside your repository, then gives VS Code a focused activity bar for reviewing and maintaining it.

Marketplace id: `arcridge.sundial`.

## Why Use Sundial

AI coding sessions move faster when the agent can see the project rules that matter: architectural decisions, rejected approaches, domain vocabulary, workflow notes, and research that should not be rediscovered every time. Sundial makes that memory explicit, reviewable, and version-controlled.

Sundial is built around a project-local store, not a hosted service:

- `sundial/decisions/accepted/` stores approved Decision Records that agents should follow.
- `sundial/decisions/candidates/` stores proposed decisions waiting for human review.
- `sundial/decisions/rejected/` and `sundial/decisions/retired/` preserve decision history.
- `sundial/research/` stores longer reference notes that agents can retrieve later.
- `sundial/specs/` stores living implementation specs and `workflow.yml` for spec lanes.
- `sundial/domains.md` keeps the project domain vocabulary visible in source control.

## VS Code Features

The Sundial activity bar adds webview-backed sidebar sections for the day-to-day workflow:

- **Decision Records**: browse accepted DRs, filter by domain, open a rendered preview, edit source Markdown, disable stale guidance, or retire a record.
- **Research**: browse research notes with summaries, filter by domain, preview notes, and jump to source.
- **Specs**: browse implementation specs grouped by workflow status, collapse noisy groups, open specs, and launch the full specs board.
- **Specs Board**: create specs, drag specs between lanes, archive specs, and delete specs through the CLI-backed workflow.
- **Candidates**: review proposed DRs, preview or edit the source, accept candidates into approved records, reject them with a reason, retire them, or dismiss throwaway proposals.
- **Rejected and Retired DRs**: inspect lifecycle history, promote records back when needed, or delete old files from disk.
- **Welcome and Diagnostics**: initialize new workspaces, install the CLI, and inspect extension diagnostics when something needs debugging.

The extension watches `sundial/decisions`, `sundial/research`, and `sundial/specs` so the sidebar refreshes when files change outside VS Code, including changes made by terminal commands or agent runs.

## Agent Workflows

During initialization, Sundial can install managed agent assets for Claude Code, Codex, or both:

- Claude Code skills under `.claude/`, plus `.claude/CLAUDE.md`.
- Codex skills under `.agents/`, plus `AGENTS.md`.

Those instructions tell agents to retrieve accepted Decision Records before consequential design or implementation work, propose new candidate DRs when they discover reusable guidance, and store long-form research notes when details are likely to be forgotten or misremembered.

Bootstrap runs can use Claude Code or Codex to inspect the project and create candidate DRs through the Sundial CLI. Candidates then flow through the same human review path as hand-authored proposals.

## Getting Started

1. Open a workspace in VS Code.
2. Open the Sundial activity bar.
3. Install the Sundial CLI from the welcome view if it is not already available.
4. Initialize the project and choose Claude Code, Codex, or both.
5. Run `Sundial: Bootstrap Decisions` or start adding specs, research, and candidate DRs as the project evolves.
6. Review candidates in the Sundial sidebar and accept only the guidance that should become future agent precedent.

If VS Code cannot find the CLI on `PATH`, set `sundial.cliPath` to the executable you want the extension to use.

## Recommended Extensions

Sundial keeps its records in Markdown so they stay easy to review, diff, and edit. These companion extensions make that editing loop more comfortable:

- **Markdown Inline Editor** by CodeSmith: edit Markdown with a more direct, document-like flow while keeping the source file as the source of truth.
- **Markco - Markdown Comments** by Oren Maoz: add and manage comments in Markdown files, which is especially useful when reviewing specs, research notes, and candidate decisions.

## Commands

Sundial contributes these user-facing commands:

- `Sundial: Install CLI`
- `Sundial: Bootstrap Decisions`
- `Sundial: Show Diagnostics`
- `Sundial: Filter Decision Records by Domain`
- `Sundial: Clear Decision Record Filters`
- `Sundial: Open Decision Record Preview`
- `Sundial: Edit Decision Record Source`
- `Sundial: Filter Research by Domain`
- `Sundial: Clear Research Filters`
- `Sundial: Open Research Preview`
- `Sundial: Edit Research Source`
- `Sundial: Open Specs Board`
- `Sundial: Open Spec`
- `Sundial: Open Candidate Preview`
- `Sundial: Edit Candidate Source`
- `Sundial: Accept Candidate`
- `Sundial: Reject Candidate`
- `Sundial: Retire Candidate`
- `Sundial: Dismiss Candidate`

## Why Markdown

Sundial records are ordinary files. Engineers can read them in code review, agents can retrieve them as context, and the team can diff, edit, branch, retire, or delete them using normal repository workflows.
