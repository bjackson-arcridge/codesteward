# CodeSteward

CodeSteward helps teams turn engineering decisions into durable context for coding agents.

Marketplace id: `arcridge.codesteward-vscode`.

## What It Does

CodeSteward initializes a project-local Decision Record repository backed by plain Markdown files:

- `.codesteward/drs/accepted/` stores reviewed decisions agents should follow.
- `.codesteward/drs/candidates/` stores proposed decisions waiting for human review.
- `.codesteward/tags.md` keeps the decision vocabulary reviewable in source control.

During initialization, CodeSteward can also install agent runtime assets:

- Claude Code skills under `.claude/`, plus `.claude/CLAUDE.md`.
- Codex skills under `.agents/`, plus `AGENTS.md`.

Those skills tell agents to consult accepted Decision Records before design or implementation, propose new candidate records when they discover reusable guidance, and run CodeSteward status validation when the DR store changes.

## Workflow

1. Install the CodeSteward CLI from the extension welcome view.
2. Run `CodeSteward: Initialize Project`.
3. Choose the agent runtimes you want CodeSteward to configure.
4. Use `CodeSteward: Bootstrap Decisions` to let Claude or Codex propose initial candidates.
5. Review candidates in the CodeSteward activity bar and accept only the decisions that should become future agent guidance.

Accepted Decision Records become the project precedent agents can retrieve. Candidate, rejected, and retired records remain in Markdown so the decision history stays visible and versionable; rejected and retired records can also be deleted from their history views when the file should be removed from disk.

## Why Markdown

The store is plain files in your repository, not a hosted service or hidden database. Engineers can read, diff, edit, and review the same records that agents use as context.
