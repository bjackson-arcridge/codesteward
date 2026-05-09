# Troubleshooting

> Solutions to common issues with Claude Code installation and usage.

Source: https://code.claude.com/docs/en/troubleshooting

## Configuration file locations

| File                          | Purpose                                                  |
| :---------------------------- | :------------------------------------------------------- |
| `~/.claude/settings.json`     | User settings (permissions, hooks, model overrides)      |
| `.claude/settings.json`       | Project settings (checked into source control)           |
| `.claude/settings.local.json` | Local project settings (not committed)                   |
| `~/.claude.json`              | Global state (theme, OAuth, MCP servers)                 |
| `.mcp.json`                   | Project MCP servers (checked into source control)        |
| `managed-mcp.json`            | Managed MCP servers                                      |
| Managed settings              | Server-managed, MDM/OS-level policies, or file-based     |

## Resetting configuration

```bash
# Reset all user settings and state
rm ~/.claude.json
rm -rf ~/.claude/

# Reset project-specific settings
rm -rf .claude/
rm .mcp.json
```

## Permissions and authentication

### Repeated permission prompts
Use `/permissions` command to allow specific tools to run without approval.

### Authentication issues
1. Run `/logout` to sign out completely
2. Close Claude Code
3. Restart with `claude` and re-authenticate

### 403 Forbidden after login
- **Claude Pro/Max**: verify subscription at claude.ai/settings
- **Console users**: confirm "Claude Code" or "Developer" role
- **Behind proxy**: see network configuration for proxy setup

## Performance and stability

### High CPU or memory usage
1. Use `/compact` regularly to reduce context size
2. Close and restart between major tasks
3. Add large build directories to `.gitignore`

### Command hangs or freezes
1. Press Ctrl+C to cancel
2. Close terminal and restart if unresponsive

### Search and discovery issues
If Search, `@file` mentions, custom agents, and skills aren't working, install system `ripgrep`:

```bash
# macOS
brew install ripgrep

# Ubuntu/Debian
sudo apt install ripgrep

# Alpine Linux
apk add ripgrep
```

Then set `USE_BUILTIN_RIPGREP=0` in environment.

## Debugging

* Toggle verbose mode with `Ctrl+O` to see hook output in transcript
* Run `claude --debug` for full execution details
* Run `/doctor` to diagnose issues (installation, settings, MCP, plugins, agents, context usage)

## Get more help

* `/bug` command to report problems to Anthropic
* GitHub: github.com/anthropics/claude-code
* `/doctor` for diagnostics
* Ask Claude directly about its capabilities
