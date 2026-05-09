# Automate workflows with hooks

> Run shell commands automatically when Claude Code edits files, finishes tasks, or needs input.

Source: https://code.claude.com/docs/en/hooks-guide

Hooks are user-defined shell commands that execute at specific points in Claude Code's lifecycle. They provide deterministic control over Claude Code's behavior.

## Hook events

| Event                | When it fires                                                          |
| :------------------- | :--------------------------------------------------------------------- |
| `SessionStart`       | When a session begins or resumes                                       |
| `UserPromptSubmit`   | When you submit a prompt, before Claude processes it                   |
| `PreToolUse`         | Before a tool call executes. Can block it                              |
| `PermissionRequest`  | When a permission dialog appears                                       |
| `PostToolUse`        | After a tool call succeeds                                             |
| `PostToolUseFailure` | After a tool call fails                                                |
| `Notification`       | When Claude Code sends a notification                                  |
| `SubagentStart`      | When a subagent is spawned                                             |
| `SubagentStop`       | When a subagent finishes                                               |
| `Stop`               | When Claude finishes responding                                        |
| `TeammateIdle`       | When an agent team teammate is about to go idle                        |
| `TaskCompleted`      | When a task is being marked as completed                               |
| `InstructionsLoaded` | When a CLAUDE.md or `.claude/rules/*.md` file is loaded into context   |
| `ConfigChange`       | When a configuration file changes during a session                     |
| `WorktreeCreate`     | When a worktree is being created                                       |
| `WorktreeRemove`     | When a worktree is being removed                                       |
| `PreCompact`         | Before context compaction                                              |
| `SessionEnd`         | When a session terminates                                              |

## Hook types

* `"type": "command"`: runs a shell command
* `"type": "http"`: POST event data to a URL
* `"type": "prompt"`: single-turn LLM evaluation
* `"type": "agent"`: multi-turn verification with tool access

## Hook input

Every event includes common fields like `session_id` and `cwd`. Example `PreToolUse` input:

```json
{
  "session_id": "abc123",
  "cwd": "/Users/sarah/myproject",
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": {
    "command": "npm test"
  }
}
```

## Hook output (exit codes)

* **Exit 0**: the action proceeds. For `UserPromptSubmit` and `SessionStart`, stdout is added to Claude's context.
* **Exit 2**: the action is blocked. Stderr becomes Claude's feedback.
* **Any other exit code**: the action proceeds. Stderr is logged but not shown to Claude.

## Structured JSON output

Exit 0 with JSON for structured control:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Use rg instead of grep for better performance"
  }
}
```

`PreToolUse` permission decisions: `"allow"`, `"deny"`, `"ask"`

For `UserPromptSubmit` hooks, use `additionalContext` to inject text into Claude's context.

## Matchers

| Event                                                                 | What the matcher filters  | Example matcher values                     |
| :-------------------------------------------------------------------- | :------------------------ | :----------------------------------------- |
| `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`| tool name                 | `Bash`, `Edit\|Write`, `mcp__.*`           |
| `SessionStart`                                                        | how the session started   | `startup`, `resume`, `clear`, `compact`    |
| `SessionEnd`                                                          | why the session ended     | `clear`, `logout`, `prompt_input_exit`     |
| `Notification`                                                        | notification type         | `permission_prompt`, `idle_prompt`         |
| `SubagentStart`, `SubagentStop`                                       | agent type                | `Bash`, `Explore`, `Plan`, custom names    |
| `PreCompact`                                                          | compaction trigger        | `manual`, `auto`                           |
| `ConfigChange`                                                        | configuration source      | `user_settings`, `project_settings`, etc.  |
| `UserPromptSubmit`, `Stop`, `TaskCompleted`, etc.                     | no matcher support        | always fires                               |

## Configure hook location

| Location                                  | Scope                              | Shareable |
| :---------------------------------------- | :--------------------------------- | :-------- |
| `~/.claude/settings.json`                 | All your projects                  | No        |
| `.claude/settings.json`                   | Single project                     | Yes       |
| `.claude/settings.local.json`             | Single project                     | No        |
| Managed policy settings                   | Organization-wide                  | Yes       |
| Plugin `hooks/hooks.json`                 | When plugin is enabled             | Yes       |
| Skill or agent frontmatter                | While the skill/agent is active    | Yes       |

## Common patterns

### Auto-format code after edits

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '.tool_input.file_path' | xargs npx prettier --write"
          }
        ]
      }
    ]
  }
}
```

### Block edits to protected files

PreToolUse hook script that checks file paths against protected patterns and exits with code 2 to block.

### Re-inject context after compaction

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "compact",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Reminder: use Bun, not npm. Run bun test before committing.'"
          }
        ]
      }
    ]
  }
}
```

### Audit configuration changes

```json
{
  "hooks": {
    "ConfigChange": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "jq -c '{timestamp: now | todate, source: .source, file: .file_path}' >> ~/claude-config-audit.log"
          }
        ]
      }
    ]
  }
}
```

## Prompt-based hooks

Use `type: "prompt"` for decisions requiring judgment. The model returns `"ok": true/false` with optional `"reason"`:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Check if all tasks are complete. If not, respond with {\"ok\": false, \"reason\": \"what remains\"}."
          }
        ]
      }
    ]
  }
}
```

## Agent-based hooks

Use `type: "agent"` when verification requires inspecting files or running commands. Agent hooks spawn a subagent with tool access:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "agent",
            "prompt": "Verify that all unit tests pass. Run the test suite and check the results. $ARGUMENTS",
            "timeout": 120
          }
        ]
      }
    ]
  }
}
```

Default timeout: 60 seconds, up to 50 tool-use turns.

## HTTP hooks

POST event data to an HTTP endpoint:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "hooks": [
          {
            "type": "http",
            "url": "http://localhost:8080/hooks/tool-use",
            "headers": {
              "Authorization": "Bearer $MY_TOKEN"
            },
            "allowedEnvVars": ["MY_TOKEN"]
          }
        ]
      }
    ]
  }
}
```

## Limitations

* Command hooks communicate through stdout, stderr, and exit codes only
* Hook timeout is 10 minutes by default, configurable per hook with `timeout` field (in seconds)
* `PostToolUse` hooks cannot undo actions
* `PermissionRequest` hooks do not fire in non-interactive mode (`-p`)
* `Stop` hooks fire whenever Claude finishes responding, not only at task completion
* Stop hooks won't fire on user interrupts

## Troubleshooting

### Stop hook runs forever
Check `stop_hook_active` field in JSON input and exit early if `true`:

```bash
#!/bin/bash
INPUT=$(cat)
if [ "$(echo "$INPUT" | jq -r '.stop_hook_active')" = "true" ]; then
  exit 0
fi
```

### JSON validation failed
Shell profile `echo` statements can prepend text to JSON output. Wrap echoes in interactive-only check:

```bash
if [[ $- == *i* ]]; then
  echo "Shell ready"
fi
```
