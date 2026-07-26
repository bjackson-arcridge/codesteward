# sundial

Decision-aware coding autonomy for staff-engineer-supervised AI work. Sundial turns engineer judgment into reusable agent context by storing accepted decisions as plain markdown **Decision Records (DRs)** inside your project.

When an agent encounters a consequential choice without precedent, it writes a **candidate DR** instead of silently inventing a new rule. You review candidates in a file-backed Candidate Inbox (or in the companion VS Code extension), accept or reject them, and retire older DRs as they age out. Accepted DRs become durable project memory that the next agent run consults before designing or coding.

- Open source, file-backed, no vendor lock-in
- One-line install
- Works with Claude Code and Codex CLI off the shelf
- Companion VS Code extension for the Candidate Inbox

## Install

```bash
npm install -g @arcridge/sundial
```

Requires Node.js >= 20.

## Quickstart

Initialize a project:

```bash
sundial init --root /path/to/project --claude --codex
```

`init` always creates `sundial/`, starter domains, and `sundial/SUNDIAL-INSTRUCTIONS.md`. Agent-specific skills are opt-in:

- `--claude` writes missing Claude Code skills to `.claude/skills/` from CLI templates.
- `--codex` writes missing Codex skills to `.agents/skills/` from CLI templates.
- Pass both flags to install both agent integrations.
- Pass `--folder docs` to keep the store at `/path/to/project/sundial` while installing runtime assets under `/path/to/project/docs`.

Refresh installed skill files later without rerunning store init:

```bash
sundial update --claude --codex
```

The update command discovers the nearest ancestor `sundial` store by default; pass `--root /path/to/project` to target a specific project. Pass `--folder docs` to change the configured target folder, with or without runtime flags. It refreshes the canonical `sundial/SUNDIAL-INSTRUCTIONS.md`; selected harness updates also remove legacy Sundial-managed blocks from `AGENTS.md` or `.claude/CLAUDE.md` while preserving user-authored content.

## How it works

1. **Retrieve precedent.** Before design or coding, the agent consults accepted DRs.
2. **Create candidates.** When the agent hits a consequential choice with no precedent, it writes a candidate DR.
3. **Review the inbox.** The engineer edits, accepts, or rejects candidates and retires DRs that no longer apply.
4. **Improve future work.** Accepted DRs become durable project memory.

```text
project/
  sundial/
    SUNDIAL-INSTRUCTIONS.md
    domains.md
    templates/
      spec.md
    decisions/
      accepted/
        adr-001-testing-strategy.md
        dr-014-agent-permissions.md
      candidates/
        cand-027-error-boundaries.md
      rejected/
      retired/
```

## Commands

```text
sundial init --root <path> [--folder <relative-path>] [--claude] [--codex]
sundial update [--root <path>] [--folder <relative-path>] [--claude] [--codex]
sundial status
sundial domains
sundial domains --json
sundial domains add --name <name> --description <description>
sundial domains update <current-name> [--name <new-name>] [--description <description>]
sundial domains remove <name>

sundial dr list [--status accepted]
sundial dr get DR-0001
sundial dr retrieve [--domain <domain>]...
sundial dr disable DR-0001
sundial dr enable DR-0001
sundial dr retire DR-0001 [--by DR-0002]
sundial dr promote <candidate-id> --from rejected

sundial candidate create --title "Decision title" --domain <domain> --decision "Do the thing"
sundial candidate list
sundial candidate show CAND-0001
sundial candidate accept CAND-0001
sundial candidate reject CAND-0001 --reason "Covered by DR-0001"
sundial candidate retire CAND-0001 [--by DR-0001]
sundial candidate dismiss CAND-0001

sundial spec create --title "Implementation title" [--status Backlog]
sundial spec template
sundial spec list [--status Active]
sundial spec status SPEC-0001 Active
sundial spec show SPEC-0001

sundial worktree list [--json]
sundial worktree create SPEC-0001 [--json]
sundial worktree preflight SPEC-0001 [--json]
sundial worktree finish SPEC-0001 --expected-primary <sha> --expected-worktree <sha> [--primary-message <text>] [--worktree-message <text>] [--json]
```

Notes:

- Enabled accepted DRs are the only precedent retrieved by `dr retrieve`.
- Repeat `--domain` on one `dr retrieve` call to retrieve all relevant domain branches together.
- Domain reads are sorted without rewriting the file. CLI-owned adds, updates, removals, and accepted candidate proposals rewrite the domain section in canonical lexical order.
- Renaming or removing a domain is blocked while Decision Records or research notes reference it. The permanent `all` domain can only have its description updated.
- `domains --json` returns the versioned domain, exact-reference-count, and filtered-suggestion contract used by editor adapters.
- Candidate DRs can include a proposed domain with a description; accepting the DR adds that proposal to `sundial/domains.md`.
- DRs can include a `## Appendix` section for human-facing explanatory context; short and medium retrieval omit it.
- New specs render the customizable body in `sundial/templates/spec.md`; it can use `{{id}}`, `{{title}}`, `{{status}}`, `{{created}}`, `{{updated}}`, and `{{created_by}}`.
- Managed spec worktrees use `.sundial-worktrees/<spec-file-basename>` below the primary checkout. Creation and finish are guarded by current topology and Git state; `--json` returns the versioned contract used by the VS Code extension.

## VS Code

A companion VS Code extension contributes a `Sundial` activity bar view with a Candidate Inbox and project initialization, Decision Record, research, and spec workflows. The extension expects the `sundial` CLI to be available on `PATH`.

## Links

- Source: https://github.com/bjackson-arcridge/sundial
- Issues: https://github.com/bjackson-arcridge/sundial/issues
- About: https://arcridgelabs.com/sundial.html

## License

Apache 2.0
