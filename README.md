# Sundial

Sundial is a file-backed Decision Record workflow for staff-engineer-supervised AI coding. The durable core is a project-local CLI; the VS Code extension is an adapter over the same files.

## Packages

- `packages/cli`: `sundial`, the `sundial` binary, store logic, DR parsing, retrieval, candidate lifecycle, validation, and unit tests.
- `packages/vscode`: `sundial`, the Candidate Inbox view for browsing candidate DRs, opening markdown, and delegating lifecycle actions to the CLI.

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

For local CLI testing before publishing, run these from the sundial root:

```bash
npm run pack:cli           # builds and writes sundial-<version>.tgz
npm run install:cli:local  # packs (if needed) and installs the tarball globally
sundial init --root /path/to/project --claude --codex
sundial status
npm run uninstall:cli:local  # remove the global install when done
```

To publish to npm, authenticate as a publisher account first:

```bash
npm login
npm whoami
npm run publish:cli
```

If the npm account requires two-factor authentication, npm will prompt for the one-time password during login or publish. `npm whoami` should print the expected publisher username before running the publish script.

For local VS Code extension testing, package a VSIX from the extension workspace:

```bash
npm run package:vscode
code --install-extension packages/vscode/sundial-0.0.1.vsix
```

Use `--no-dependencies` because this package lives in an npm workspace and has no runtime npm dependencies. The extension id is `arcridge.sundial`. It expects the `sundial` CLI to be available on `PATH`; the welcome screen can install it with npm, and `Sundial: Cli Path` can be set if VS Code cannot find the npm-installed binary.

To publish a new version of the VS Code extension, build the VSIX as above and upload it manually at <https://marketplace.visualstudio.com/manage/publishers/arcridge>. (Automated `vsce publish` requires an Azure DevOps PAT with Marketplace Manage scope; manual upload is the current path until that's set up.)

## CLI

Implemented commands:

```bash
sundial init --root /path/to/project [--folder docs] [--claude] [--codex]
sundial update [--root /path/to/project] [--folder docs] [--claude] [--codex]
sundial status
sundial bootstrap --provider claude [--folder docs]
sundial bootstrap --provider codex [--folder docs]
sundial domains
sundial dr retrieve --domain cli --domain vscode.webview
sundial dr get DR-0001
sundial dr list --status accepted
sundial dr disable DR-0001
sundial dr enable DR-0001
sundial dr retire DR-0001 --by DR-0002
sundial dr retire DR-0001
sundial dr promote <candidate-id> --from rejected
sundial candidate create --title "Decision title" --domain cli --decision "Do the thing"
sundial candidate list
sundial candidate show CAND-0001
sundial candidate accept CAND-0001
sundial candidate reject CAND-0001 --reason "Covered by DR-0001"
sundial candidate retire CAND-0001 --by DR-0001
sundial candidate retire CAND-0001
sundial candidate dismiss CAND-0001
```

`init` always creates `sundial/`, starter domains, and `sundial/SUNDIAL-INSTRUCTIONS.md`. Agent-specific skills are opt-in:

- `--claude` writes missing Claude Code skills to `.claude/skills/` from CLI templates.
- `--codex` writes missing Codex skills to `.agents/skills/` from CLI templates.
- Pass both flags to bootstrap both runtimes.
- Pass `--folder docs` to keep the store at `/path/to/project/sundial` while installing runtime assets under `/path/to/project/docs` and running bootstrap from that folder.

Use `sundial update --claude --codex` to refresh installed generated files later without rerunning store initialization. The update command discovers the nearest ancestor `sundial` store by default; pass `--root /path/to/project` to target a specific project, or `--folder docs` to change the configured target folder. It refreshes `sundial/SUNDIAL-INSTRUCTIONS.md`; selected harness updates also remove legacy Sundial-managed blocks from `AGENTS.md` or `.claude/CLAUDE.md` while preserving user-authored content.

## VS Code

The extension contributes a `Sundial` activity bar view with a Candidate Inbox, a `Sundial: Initialize Project` command, and a `Sundial: Bootstrap Decisions` command. Bootstrap invokes the selected Claude or Codex CLI and requires it to create DR candidates through `sundial candidate create`, so candidates use the normal lifecycle path.

## Notes

- Enabled accepted DRs are the only precedent retrieved by `dr retrieve`.
- Repeat `--domain` on one `dr retrieve` call to retrieve all relevant domain branches together.
- Candidate DRs can include a proposed domain with a description; accepting the DR appends that proposal to `sundial/domains.md`.
- DRs can include a `## Appendix` section for human-facing explanatory context; short and medium retrieval omit it.
