# Create plugins

> Create custom plugins to extend Claude Code with skills, agents, hooks, and MCP servers.

Source: https://code.claude.com/docs/en/plugins

Plugins let you extend Claude Code with custom functionality that can be shared across projects and teams.

## When to use plugins vs standalone configuration

| Approach                                                    | Skill names          | Best for                                                                                        |
| :---------------------------------------------------------- | :------------------- | :---------------------------------------------------------------------------------------------- |
| **Standalone** (`.claude/` directory)                       | `/hello`             | Personal workflows, project-specific customizations, quick experiments                          |
| **Plugins** (directories with `.claude-plugin/plugin.json`) | `/plugin-name:hello` | Sharing with teammates, distributing to community, versioned releases, reusable across projects |

## Plugin structure overview

| Directory         | Location    | Purpose                                                                        |
| :---------------- | :---------- | :----------------------------------------------------------------------------- |
| `.claude-plugin/` | Plugin root | Contains `plugin.json` manifest (optional if components use default locations) |
| `commands/`       | Plugin root | Skills as Markdown files                                                       |
| `agents/`         | Plugin root | Custom agent definitions                                                       |
| `skills/`         | Plugin root | Agent Skills with `SKILL.md` files                                             |
| `hooks/`          | Plugin root | Event handlers in `hooks.json`                                                 |
| `.mcp.json`       | Plugin root | MCP server configurations                                                      |
| `.lsp.json`       | Plugin root | LSP server configurations for code intelligence                                |
| `settings.json`   | Plugin root | Default settings applied when the plugin is enabled                            |

**IMPORTANT**: Don't put `commands/`, `agents/`, `skills/`, or `hooks/` inside the `.claude-plugin/` directory. Only `plugin.json` goes inside `.claude-plugin/`. All other directories must be at the plugin root level.

## Plugin manifest

The manifest file at `.claude-plugin/plugin.json` defines the plugin's identity:

```json
{
  "name": "my-first-plugin",
  "description": "A greeting plugin to learn the basics",
  "version": "1.0.0",
  "author": {
    "name": "Your Name"
  }
}
```

| Field         | Purpose                                                                                                |
| :------------ | :----------------------------------------------------------------------------------------------------- |
| `name`        | Unique identifier and skill namespace. Skills are prefixed with this (e.g., `/my-first-plugin:hello`). |
| `description` | Shown in the plugin manager when browsing or installing plugins.                                       |
| `version`     | Track releases using semantic versioning.                                                              |
| `author`      | Optional. Helpful for attribution.                                                                     |

## Adding Skills to plugins

Add a `skills/` directory at your plugin root with Skill folders containing `SKILL.md` files:

```
my-plugin/
├── .claude-plugin/
│   └── plugin.json
└── skills/
    └── code-review/
        └── SKILL.md
```

Each `SKILL.md` needs frontmatter with `name` and `description` fields:

```yaml
---
name: code-review
description: Reviews code for best practices and potential issues.
---

When reviewing code, check for:
1. Code organization and structure
2. Error handling
3. Security concerns
4. Test coverage
```

## Adding agents to plugins

Place agent markdown files in the `agents/` directory at the plugin root. These follow the same format as subagent files.

## Adding hooks to plugins

Create `hooks/hooks.json` in the plugin's `hooks/` directory. The format is the same as hooks in settings.json:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [{ "type": "command", "command": "jq -r '.tool_input.file_path' | xargs npm run lint:fix" }]
      }
    ]
  }
}
```

## Adding MCP servers to plugins

Define in `.mcp.json` at plugin root:

```json
{
  "database-tools": {
    "command": "${CLAUDE_PLUGIN_ROOT}/servers/db-server",
    "args": ["--config", "${CLAUDE_PLUGIN_ROOT}/config.json"],
    "env": {
      "DB_URL": "${DB_URL}"
    }
  }
}
```

Or inline in `plugin.json`:

```json
{
  "name": "my-plugin",
  "mcpServers": {
    "plugin-api": {
      "command": "${CLAUDE_PLUGIN_ROOT}/servers/api-server",
      "args": ["--port", "8080"]
    }
  }
}
```

Plugin MCP features:
* **Automatic lifecycle**: Servers start when plugin enables (restart Claude Code for MCP changes)
* **Environment variables**: Use `${CLAUDE_PLUGIN_ROOT}` for plugin-relative paths
* **Multiple transport types**: Support stdio, SSE, and HTTP transports

## Adding LSP servers to plugins

Add an `.lsp.json` file to your plugin:

```json
{
  "go": {
    "command": "gopls",
    "args": ["serve"],
    "extensionToLanguage": {
      ".go": "go"
    }
  }
}
```

## Ship default settings

Plugins can include a `settings.json` file. Currently, only the `agent` key is supported:

```json
{
  "agent": "security-reviewer"
}
```

This activates one of the plugin's custom agents as the main thread.

## Testing plugins locally

Use the `--plugin-dir` flag:

```bash
claude --plugin-dir ./my-plugin
```

Run `/reload-plugins` to pick up changes without restarting.

Load multiple plugins:

```bash
claude --plugin-dir ./plugin-one --plugin-dir ./plugin-two
```

## Converting existing configurations

Migration steps:
1. Create plugin structure with `.claude-plugin/plugin.json`
2. Copy `commands/`, `agents/`, `skills/` from `.claude/` to plugin root
3. Move hooks from `settings.json` to `hooks/hooks.json`
4. Test with `--plugin-dir`

## Distributing plugins

* Add documentation with `README.md`
* Version with semantic versioning in `plugin.json`
* Distribute through plugin marketplaces
* Submit to official marketplace via claude.ai or platform.claude.com
