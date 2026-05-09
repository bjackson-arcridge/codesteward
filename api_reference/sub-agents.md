# Create custom subagents

> Create and use specialized AI subagents in Claude Code for task-specific workflows and improved context management.

Source: https://code.claude.com/docs/en/sub-agents

Subagents are specialized AI assistants that handle specific types of tasks. Each subagent runs in its own context window with a custom system prompt, specific tool access, and independent permissions. When Claude encounters a task that matches a subagent's description, it delegates to that subagent, which works independently and returns results.

> **Note:** If you need multiple agents working in parallel and communicating with each other, see agent teams instead. Subagents work within a single session; agent teams coordinate across separate sessions.

Subagents help you:

* **Preserve context** by keeping exploration and implementation out of your main conversation
* **Enforce constraints** by limiting which tools a subagent can use
* **Reuse configurations** across projects with user-level subagents
* **Specialize behavior** with focused system prompts for specific domains
* **Control costs** by routing tasks to faster, cheaper models like Haiku

Claude uses each subagent's description to decide when to delegate tasks. When you create a subagent, write a clear description so Claude knows when to use it.

Claude Code includes several built-in subagents like **Explore**, **Plan**, and **general-purpose**. You can also create custom subagents to handle specific tasks.

## Built-in subagents

### Explore
A fast, read-only agent optimized for searching and analyzing codebases.
* **Model**: Haiku (fast, low-latency)
* **Tools**: Read-only tools (denied access to Write and Edit tools)
* **Purpose**: File discovery, code search, codebase exploration

### Plan
A research agent used during plan mode to gather context before presenting a plan.
* **Model**: Inherits from main conversation
* **Tools**: Read-only tools (denied access to Write and Edit tools)
* **Purpose**: Codebase research for planning

### General-purpose
A capable agent for complex, multi-step tasks that require both exploration and action.
* **Model**: Inherits from main conversation
* **Tools**: All tools
* **Purpose**: Complex research, multi-step operations, code modifications

### Other built-in agents

| Agent             | Model    | When Claude uses it                                      |
| :---------------- | :------- | :------------------------------------------------------- |
| Bash              | Inherits | Running terminal commands in a separate context          |
| statusline-setup  | Sonnet   | When you run `/statusline` to configure your status line |
| Claude Code Guide | Haiku    | When you ask questions about Claude Code features        |

## Configure subagents

### Subagent scope

Subagents are Markdown files with YAML frontmatter. Store them in different locations depending on scope:

| Location                     | Scope                   | Priority    | How to create                         |
| :--------------------------- | :---------------------- | :---------- | :------------------------------------ |
| `--agents` CLI flag          | Current session         | 1 (highest) | Pass JSON when launching Claude Code  |
| `.claude/agents/`            | Current project         | 2           | Interactive or manual                 |
| `~/.claude/agents/`          | All your projects       | 3           | Interactive or manual                 |
| Plugin's `agents/` directory | Where plugin is enabled | 4 (lowest)  | Installed with plugins                |

**CLI-defined subagents** are passed as JSON when launching Claude Code:

```bash
claude --agents '{
  "code-reviewer": {
    "description": "Expert code reviewer. Use proactively after code changes.",
    "prompt": "You are a senior code reviewer. Focus on code quality, security, and best practices.",
    "tools": ["Read", "Grep", "Glob", "Bash"],
    "model": "sonnet"
  }
}'
```

The `--agents` flag accepts JSON with the same frontmatter fields as file-based subagents: `description`, `prompt`, `tools`, `disallowedTools`, `model`, `permissionMode`, `mcpServers`, `hooks`, `maxTurns`, `skills`, and `memory`.

### Write subagent files

```markdown
---
name: code-reviewer
description: Reviews code for quality and best practices
tools: Read, Glob, Grep
model: sonnet
---

You are a code reviewer. When invoked, analyze the code and provide
specific, actionable feedback on quality, security, and best practices.
```

The frontmatter defines the subagent's metadata and configuration. The body becomes the system prompt. Subagents receive only this system prompt (plus basic environment details like working directory), not the full Claude Code system prompt.

### Supported frontmatter fields

| Field             | Required | Description                                                                      |
| :---------------- | :------- | :------------------------------------------------------------------------------- |
| `name`            | Yes      | Unique identifier using lowercase letters and hyphens                            |
| `description`     | Yes      | When Claude should delegate to this subagent                                     |
| `tools`           | No       | Tools the subagent can use. Inherits all tools if omitted                        |
| `disallowedTools` | No       | Tools to deny, removed from inherited or specified list                          |
| `model`           | No       | Model to use: `sonnet`, `opus`, `haiku`, or `inherit`. Defaults to `inherit`     |
| `permissionMode`  | No       | Permission mode: `default`, `acceptEdits`, `dontAsk`, `bypassPermissions`, `plan`|
| `maxTurns`        | No       | Maximum number of agentic turns before the subagent stops                        |
| `skills`          | No       | Skills to load into the subagent's context at startup                            |
| `mcpServers`      | No       | MCP servers available to this subagent                                           |
| `hooks`           | No       | Lifecycle hooks scoped to this subagent                                          |
| `memory`          | No       | Persistent memory scope: `user`, `project`, or `local`                           |
| `background`      | No       | Set to `true` to always run as a background task. Default: `false`               |
| `isolation`       | No       | Set to `worktree` to run in a temporary git worktree                             |

### Permission modes

| Mode                | Behavior                                                           |
| :------------------ | :----------------------------------------------------------------- |
| `default`           | Standard permission checking with prompts                          |
| `acceptEdits`       | Auto-accept file edits                                             |
| `dontAsk`           | Auto-deny permission prompts (explicitly allowed tools still work) |
| `bypassPermissions` | Skip all permission checks                                        |
| `plan`              | Plan mode (read-only exploration)                                  |

### Preload skills into subagents

Use the `skills` field to inject skill content into a subagent's context at startup:

```yaml
---
name: api-developer
description: Implement API endpoints following team conventions
skills:
  - api-conventions
  - error-handling-patterns
---
```

The full content of each skill is injected into the subagent's context, not just made available for invocation. Subagents don't inherit skills from the parent conversation.

### Enable persistent memory

The `memory` field gives the subagent a persistent directory that survives across conversations.

| Scope     | Location                                      | Use when                                                    |
| :-------- | :-------------------------------------------- | :---------------------------------------------------------- |
| `user`    | `~/.claude/agent-memory/<name-of-agent>/`     | the subagent should remember learnings across all projects  |
| `project` | `.claude/agent-memory/<name-of-agent>/`       | project-specific, shareable via version control             |
| `local`   | `.claude/agent-memory-local/<name-of-agent>/` | project-specific, not checked into version control          |

When memory is enabled:
* The subagent's system prompt includes instructions for reading and writing to the memory directory
* The first 200 lines of `MEMORY.md` in the memory directory are included in the system prompt
* Read, Write, and Edit tools are automatically enabled

### Restrict which subagents can be spawned

Use `Agent(agent_type)` syntax in the `tools` field:

```yaml
---
name: coordinator
description: Coordinates work across specialized agents
tools: Agent(worker, researcher), Read, Bash
---
```

### Disable specific subagents

Add to the `deny` array in settings:

```json
{
  "permissions": {
    "deny": ["Agent(Explore)", "Agent(my-custom-agent)"]
  }
}
```

## Define hooks for subagents

### Hooks in subagent frontmatter

All hook events are supported. Common events for subagents:

| Event         | Matcher input | When it fires                                                       |
| :------------ | :------------ | :------------------------------------------------------------------ |
| `PreToolUse`  | Tool name     | Before the subagent uses a tool                                     |
| `PostToolUse` | Tool name     | After the subagent uses a tool                                      |
| `Stop`        | (none)        | When the subagent finishes (converted to `SubagentStop` at runtime) |

### Project-level hooks for subagent events

| Event           | Matcher input   | When it fires                    |
| :-------------- | :-------------- | :------------------------------- |
| `SubagentStart` | Agent type name | When a subagent begins execution |
| `SubagentStop`  | Agent type name | When a subagent completes        |

## Work with subagents

### Running modes
* **Foreground subagents** block the main conversation until complete
* **Background subagents** run concurrently; Claude pre-approves permissions before launching

### Resume subagents
Each subagent invocation creates a new instance with fresh context. To continue an existing subagent's work, ask Claude to resume it. Resumed subagents retain their full conversation history.

Subagent transcripts persist at `~/.claude/projects/{project}/{sessionId}/subagents/` as `agent-{agentId}.jsonl`.

### Auto-compaction
Subagents support automatic compaction at approximately 95% capacity. Override with `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`.

### Key constraints
* Subagents cannot spawn other subagents
* `context: fork` in skills creates a subagent context
* For nested delegation, use Skills or chain subagents from the main conversation
