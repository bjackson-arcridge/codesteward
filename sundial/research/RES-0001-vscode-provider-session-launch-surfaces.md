---
id: RES-0001
title: VS Code provider session launch surfaces
domain: vscode.extension
summary: Official Codex and Claude Code VS Code extensions expose different launch surfaces; Claude documents a prompt-prefill URI, while the installed Codex extension opens panels/threads and has an implement-todo command path without a verified general prompt-prefill path.
created: 2026-07-07
updated: 2026-07-07
---

## Research

This research was collected on 2026-07-07 while planning `SPEC-0004`.

### Findings

- Codex official manual source: https://developers.openai.com/codex/codex-manual.md
- Claude Code official VS Code docs source: https://code.claude.com/docs/en/vs-code
- Local Codex extension manifest checked: `/Users/bjackson/.vscode/extensions/openai.chatgpt-26.616.30709-darwin-arm64/package.json`
- Local Claude Code extension manifest checked: `/Users/bjackson/.vscode/extensions/anthropic.claude-code-2.1.199-darwin-arm64/package.json`
- Reddit-focused web searches on 2026-07-07 found no relevant results for:
  - `site:reddit.com Codex VS Code extension prompt prefill chatgpt.newCodexPanel`
  - `site:reddit.com OpenAI Codex VS Code extension URI prompt vscode://openai.chatgpt`
  - `site:reddit.com chatgpt.newChat Codex VS Code prompt argument`
  - `site:reddit.com Codex VS Code extension new chat prefill prompt`
  - `reddit Codex VS Code extension prompt prefill`
  - `reddit OpenAI Codex VS Code extension new chat prompt`
  - `reddit "chatgpt.newCodexPanel"`
  - `reddit "vscode://openai.chatgpt"`

Codex:
- Official docs list these VS Code command IDs:
  - `chatgpt.addToThread`
  - `chatgpt.addFileToThread`
  - `chatgpt.newChat`
  - `chatgpt.implementTodo`
  - `chatgpt.newCodexPanel`
  - `chatgpt.openSidebar`
- Official docs list IDE slash commands including `/plan`, `/review`, `/local`, `/cloud`, `/goal`, and `/status`.
- Official docs describe plugins as bundles of skills, app integrations, and MCP servers; they are installed/invoked from prompts and are not documented as a VS Code session launch mechanism.
- Installed manifest publisher/name is `openai.chatgpt`.
- Installed manifest activation events include `onStartupFinished` and `onUri`.
- Installed manifest contributed commands include:
  - `chatgpt.implementTodo`
  - `chatgpt.openSidebar`
  - `chatgpt.openCommandMenu`
  - `chatgpt.newCodexPanel`
  - `chatgpt.addToThread`
  - `chatgpt.addFileToThread`
  - `chatgpt.newChat`
- Installed manifest contributes a `chatSessions` type named `openai-codex`.
- Static inspection of `/Users/bjackson/.vscode/extensions/openai.chatgpt-26.616.30709-darwin-arm64/out/extension.js` found these command registrations:
  - `chatgpt.newCodexPanel` is registered as `async Ae => { Ae?.source === Rrt && ...; Be.createNewPanel(); }`.
  - `chatgpt.newChat` is registered as `async () => { await qi(); Be.triggerNewChatViaWebview(); }`.
  - `chatgpt.newCodexPanel` reads an optional `source` property, but no `prompt` argument was found in that handler.
  - `chatgpt.newChat` does not declare or read command arguments in that handler.
- Static inspection found `chatgpt.implementTodo` registered with an argument object shaped as `{ line, fileName, comment }`.
- The `chatgpt.implementTodo` handler calls `qi()`, then posts a webview message shaped as `{ type: "implement-todo", fileName, line, comment }` when the sidebar webview is ready, or stores the same object as `pendingImplementTodo`.
- The installed Codex extension's CodeLens provider creates `chatgpt.implementTodo` command arguments as:
  - `fileName: encodeURIComponent(document.uri.fsPath)`
  - `line: commentLine + 1`
  - `comment: parsedTodoCommentBody`
- The installed Codex extension parses TODO-like comments for the `Implement with Codex` CodeLens and uses the parsed comment body as the `comment` argument.
- Static inspection found the URI handler class uses `e.path || "/"`, handles `/connector/oauth_callback`, and otherwise calls `this.codexWebviewProvider.navigateToRoute(r)`.
- Static inspection of the URI handler did not find query parameter handling for `prompt`.

Claude Code:
- The VS Code extension is the recommended graphical interface for Claude Code in VS Code.
- The extension supports plan review, inline diffs, @-mentions, conversation history, and multiple conversations in separate tabs/windows.
- The prompt box has permission modes, including Plan mode, where Claude describes what it will do and waits for approval before making changes.
- The extension manages plugins through `/plugins`; plugin management uses the same CLI commands under the hood.
- The extension registers a URI handler:
  - `vscode://anthropic.claude-code/open`
- The URI handler supports query parameters:
  - `prompt`: URL-encoded text to pre-fill in the prompt box.
  - `session`: a session ID to resume.
- The docs explicitly say the prompt is pre-filled but not submitted automatically.
- Documented example URI: `vscode://anthropic.claude-code/open?prompt=review%20my%20changes`
- Installed manifest publisher/name is `Anthropic.claude-code`, surfaced to VS Code extension lookup as `anthropic.claude-code`.
- Installed manifest setting `claudeCode.initialPermissionMode` includes:
  - `default`
  - `acceptEdits`
  - `plan`
  - `bypassPermissions`
- Installed manifest contributed commands include:
  - `claude-vscode.editor.open`
  - `claude-vscode.editor.openLast`
  - `claude-vscode.primaryEditor.open`
  - `claude-vscode.window.open`
  - `claude-vscode.sidebar.open`
  - `claude-vscode.newConversation`
  - `claude-vscode.focus`
  - `claude-vscode.terminal.open`
  - `claude-vscode.installPlugin`

### Unknowns

- Public Codex docs do not document a prompt-prefill URI or command argument for opening a new thread with preloaded text.
- Public Codex docs list `chatgpt.implementTodo` as a command ID but do not document its argument shape.
- Static inspection did not find a Codex prompt-prefill path in the installed command handlers or URI handler, but this was not confirmed by an interactive visual smoke test.
- If Codex has a first-party prompt-prefill path outside the documented commands and inspected handler paths, it was not identified.
