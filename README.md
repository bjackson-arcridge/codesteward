# CodeSteward

CodeSteward is a file-backed Decision Record workflow for staff-engineer-supervised AI coding. The durable core is a project-local CLI; the VS Code extension is an adapter over the same files.

## Packages

- `packages/cli`: `codesteward`, the `codesteward` binary, store logic, DR parsing, retrieval, candidate lifecycle, validation, and unit tests.
- `packages/vscode`: `codesteward`, the Candidate Inbox view for browsing candidate DRs, opening markdown, and delegating lifecycle actions to the CLI.

The repository root is an npm workspace used for shared tooling and orchestration.

## Development

```bash
npm run test:unit
npm run check-types
npm run lint
npm run compile
```

Run the built CLI from the workspace:

```bash
node packages/cli/dist/main.js init --root /path/to/project --claude --codex
```

## Install Flow

The intended user setup is:

1. Install the CLI with npm.
2. Install the VS Code extension.
3. Initialize each project from the project root, either in a terminal or from VS Code.

For local CLI testing before publishing, run these from the codesteward root:

```bash
npm run pack:cli           # builds and writes codesteward-<version>.tgz
npm run install:cli:local  # packs (if needed) and installs the tarball globally
codesteward init --root /path/to/project --claude --codex
codesteward status
npm run uninstall:cli:local  # remove the global install when done
```

To publish to npm (requires `npm login` as the publisher account):

```bash
npm run publish:cli
```

For local VS Code extension testing, package a VSIX from the extension workspace:

```bash
npm run package:vscode
code --install-extension packages/vscode/codesteward-vscode-0.0.1.vsix
```

Use `--no-dependencies` because this package lives in an npm workspace and has no runtime npm dependencies. The extension id is `arcridge.codesteward-vscode`. It expects the `codesteward` CLI to be available on `PATH`; the welcome screen can install it with npm, and `CodeSteward: Cli Path` can be set if VS Code cannot find the npm-installed binary.

## CLI

Implemented commands:

```bash
codesteward init --root /path/to/project [--claude] [--codex]
codesteward update --claude --codex
codesteward status
codesteward bootstrap --provider claude
codesteward bootstrap --provider codex
codesteward tags
codesteward dr retrieve --domain vscode --tag ui-pattern
codesteward dr get DR-0001
codesteward dr list --status accepted
codesteward dr disable DR-0001
codesteward dr enable DR-0001
codesteward dr retire DR-0001 --by DR-0002
codesteward dr retire DR-0001
codesteward dr promote CAND-0003 --from rejected
codesteward candidate create --title "Decision title" --domain cli --decision "Do the thing" --tag subprocess
codesteward candidate list
codesteward candidate show CAND-0001
codesteward candidate accept CAND-0001
codesteward candidate reject CAND-0001 --reason "Covered by DR-0001"
codesteward candidate retire CAND-0001 --by DR-0001
codesteward candidate retire CAND-0001
```

`init` always creates `.codesteward/` and starter tags. Runtime assets are opt-in:

- `--claude` writes missing Claude Code project assets to `.claude/skills/` and `.claude/CLAUDE.md` from CLI templates.
- `--codex` writes missing Codex project assets to `.agents/skills/` and `AGENTS.md` from CLI templates.
- Pass both flags to bootstrap both runtimes.

Use `codesteward update --claude --codex` to refresh installed generated skill files later without rerunning store initialization. The update command discovers the nearest ancestor `.codesteward` store by default; pass `--root /path/to/project` to target a specific project. CodeSteward-owned instruction blocks in files such as `AGENTS.md` and `.claude/CLAUDE.md` are repaired or refreshed without overwriting user-authored content outside those blocks.

## VS Code

The extension contributes a `CodeSteward` activity bar view with a Candidate Inbox, a `CodeSteward: Initialize Project` command, and a `CodeSteward: Bootstrap Decisions` command. Bootstrap invokes the selected Claude or Codex CLI and requires it to create DR candidates through `codesteward candidate create`, so candidates use the normal lifecycle path.

## Notes

- Enabled accepted DRs are the only precedent retrieved by `dr retrieve`.
- Candidate DRs can include proposed tags and domains with descriptions; accepting the DR appends those proposals to `.codesteward/tags.md`.
- DRs can include a `## Appendix` section for human-facing explanatory context; short and medium retrieval omit it.
