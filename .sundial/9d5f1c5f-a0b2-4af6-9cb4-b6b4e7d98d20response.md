## Outcome

Completely removed the agent-driven bootstrap feature.

- The CLI no longer advertises or dispatches `sundial bootstrap`, and all provider execution, prompting, streaming, and bootstrap-only dependency code is gone.
- VS Code no longer contributes or registers a bootstrap command, prompts after initialization, or exposes a candidate-sidebar bootstrap button/provider selector.
- The candidate webview protocol and diagnostics no longer carry bootstrap/provider state.
- The bootstrap integration scenario and fixtures were removed.
- User documentation now describes initialization only.

## Important files

- CLI: `packages/cli/src/main.ts`, `packages/cli/src/unit/main.test.ts`, `packages/cli/package.json`
- VS Code host and manifest: `packages/vscode/src/extension.ts`, `packages/vscode/package.json`
- Candidate webview: `packages/vscode/src/webviews/candidates/messages.ts`, `packages/vscode/src/webviews/candidates/candidatesWebviewProvider.ts`, `packages/vscode/src/webviews/apps/candidates/candidates-app.ts`
- Tests and scenarios under `packages/vscode/src/unit/` and `packages/vscode/src/test/`
- Documentation: `README.md`, `packages/cli/README.md`, `packages/vscode/README.md`
- Versions: CLI and VS Code extension are now `0.6.0`; `package-lock.json` is synchronized.
- Proposed `CAND-0003 Do not offer LLM project bootstrap`, which records the user-directed removal and supersedes the bootstrap-specific accepted guidance when reviewed.

## Validation

- Regression tests first failed while the CLI and VS Code bootstrap entry points still existed.
- `npm run check-types` — passed.
- `npm run lint` — passed.
- `npm run test:unit` — 136 passed.
- `npm test` — passed against the verified project-managed VS Code 1.118.1 runtime; 11 integration tests passed across the remaining scenarios.
- `git diff --check` — passed.
- `sundial status` — 0 errors; 12 existing missing-reference warnings.

## Blocker

The implementation is complete, but after the user's follow-up message `sundial-agent-tools` stopped receiving an active managed workspace context. Status publication and task-response recording therefore report `No active managed workspace context was provided.`
