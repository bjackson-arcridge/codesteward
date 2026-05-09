# codesteward

Decision-aware coding autonomy for staff-engineer-supervised AI work. CodeSteward turns engineer judgment into reusable agent context by storing accepted decisions as plain markdown **Decision Records (DRs)** inside your project.

When an agent encounters a consequential choice without precedent, it writes a **candidate DR** instead of silently inventing a new rule. You review candidates in a file-backed Candidate Inbox (or in the companion VS Code extension), accept or reject them, and retire older DRs as they age out. Accepted DRs become durable project memory that the next agent run consults before designing or coding.

- Open source, file-backed, no vendor lock-in
- One-line install
- Works with Claude Code and Codex CLI off the shelf
- Companion VS Code extension for the Candidate Inbox

## Install

```bash
npm install -g codesteward
```

Requires Node.js >= 20.

## Quickstart

Initialize a project:

```bash
codesteward init --root /path/to/project --claude --codex
```

`init` always creates `.codesteward/` and starter tags. Runtime assets are opt-in:

- `--claude` writes missing Claude Code project assets to `.claude/skills/` and `.claude/CLAUDE.md` from CLI templates.
- `--codex` writes missing Codex project assets to `.agents/skills/` and `AGENTS.md` from CLI templates.
- Pass both flags to bootstrap both runtimes.

Refresh installed skill files later without rerunning store init:

```bash
codesteward update --claude --codex
```

The update command discovers the nearest ancestor `.codesteward` store by default; pass `--root /path/to/project` to target a specific project. CodeSteward-owned instruction blocks in files such as `AGENTS.md` and `.claude/CLAUDE.md` are repaired or refreshed without overwriting user-authored content outside those blocks.

## How it works

1. **Retrieve precedent.** Before design or coding, the agent consults accepted DRs.
2. **Create candidates.** When the agent hits a consequential choice with no precedent, it writes a candidate DR.
3. **Review the inbox.** The engineer edits, accepts, or rejects candidates and retires DRs that no longer apply.
4. **Improve future work.** Accepted DRs become durable project memory.

```text
project/
  .codesteward/
    tags.md
    drs/
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
codesteward init --root <path> [--claude] [--codex]
codesteward update --claude --codex
codesteward status
codesteward bootstrap --provider claude
codesteward bootstrap --provider codex
codesteward tags

codesteward dr list [--status accepted]
codesteward dr get DR-0001
codesteward dr retrieve --domain <domain> --tag <tag>
codesteward dr disable DR-0001
codesteward dr enable DR-0001
codesteward dr retire DR-0001 [--by DR-0002]
codesteward dr promote CAND-0003 --from rejected

codesteward candidate create --title "Decision title" --domain <domain> --decision "Do the thing" --tag <tag>
codesteward candidate list
codesteward candidate show CAND-0001
codesteward candidate accept CAND-0001
codesteward candidate reject CAND-0001 --reason "Covered by DR-0001"
codesteward candidate retire CAND-0001 [--by DR-0001]
```

Notes:

- Enabled accepted DRs are the only precedent retrieved by `dr retrieve`.
- Candidate DRs can include proposed tags and domains with descriptions; accepting the DR appends those proposals to `.codesteward/tags.md`.
- DRs can include a `## Appendix` section for human-facing explanatory context; short and medium retrieval omit it.

## VS Code

A companion VS Code extension contributes a `CodeSteward` activity bar view with a Candidate Inbox, a `CodeSteward: Initialize Project` command, and a `CodeSteward: Bootstrap Decisions` command. Bootstrap invokes the selected Claude or Codex CLI and requires it to create DR candidates through `codesteward candidate create`, so candidates use the normal lifecycle path. The extension expects the `codesteward` CLI to be available on `PATH`.

## Links

- Source: https://github.com/bjackson-arcridge/codesteward
- Issues: https://github.com/bjackson-arcridge/codesteward/issues
- About: https://arcridgelabs.com/codesteward.html

## License

Apache 2.0
