# Connect Claude Code to tools via MCP

> Learn how to connect Claude Code to your tools with the Model Context Protocol.

Source: https://code.claude.com/docs/en/mcp

Claude Code connects to external tools and data sources through MCP (Model Context Protocol), an open source standard for AI-tool integrations.

## Installing MCP servers

### Option 1: Remote HTTP server (recommended)

```bash
claude mcp add --transport http <name> <url>

# Example with Bearer token
claude mcp add --transport http secure-api https://api.example.com/mcp \
  --header "Authorization: Bearer your-token"
```

### Option 2: Remote SSE server (deprecated)

```bash
claude mcp add --transport sse <name> <url>
```

### Option 3: Local stdio server

```bash
claude mcp add [options] <name> -- <command> [args...]

# Example
claude mcp add --transport stdio --env AIRTABLE_API_KEY=YOUR_KEY airtable \
  -- npx -y airtable-mcp-server
```

**Important:** All options (`--transport`, `--env`, `--scope`, `--header`) must come **before** the server name. The `--` separates the server name from the command and arguments.

### Managing servers

```bash
claude mcp list
claude mcp get github
claude mcp remove github
/mcp  # within Claude Code
```

### Dynamic tool updates

Claude Code supports MCP `list_changed` notifications, allowing MCP servers to dynamically update their available tools without reconnection.

## Plugin-provided MCP servers

Plugins can bundle MCP servers in `.mcp.json` at the plugin root or inline in `plugin.json`:

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

Features:
* **Automatic lifecycle**: Servers start when plugin enables (restart for MCP changes)
* **Environment variables**: Use `${CLAUDE_PLUGIN_ROOT}` for plugin-relative paths
* **Multiple transport types**: stdio, SSE, and HTTP

## MCP installation scopes

### Local scope (default)
Stored in `~/.claude.json` under your project's path. Private to you, only accessible in current project.

```bash
claude mcp add --transport http stripe --scope local https://mcp.stripe.com
```

### Project scope
Stored in `.mcp.json` at project root. Checked into version control for team sharing.

```bash
claude mcp add --transport http paypal --scope project https://mcp.paypal.com/mcp
```

### User scope
Stored in `~/.claude.json`. Available across all projects on your machine.

```bash
claude mcp add --transport http hubspot --scope user https://mcp.hubspot.com/anthropic
```

### Scope precedence
Local > Project > User

### Environment variable expansion in `.mcp.json`

Supported syntax: `${VAR}` and `${VAR:-default}`

Expansion locations: `command`, `args`, `env`, `url`, `headers`

```json
{
  "mcpServers": {
    "api-server": {
      "type": "http",
      "url": "${API_BASE_URL:-https://api.example.com}/mcp",
      "headers": {
        "Authorization": "Bearer ${API_KEY}"
      }
    }
  }
}
```

## Authentication

Claude Code supports OAuth 2.0 for remote MCP servers. Use `/mcp` to authenticate.

### Pre-configured OAuth credentials

```bash
claude mcp add --transport http \
  --client-id your-client-id --client-secret --callback-port 8080 \
  my-server https://mcp.example.com/mcp
```

### Override OAuth metadata discovery

```json
{
  "mcpServers": {
    "my-server": {
      "type": "http",
      "url": "https://mcp.example.com/mcp",
      "oauth": {
        "authServerMetadataUrl": "https://auth.example.com/.well-known/openid-configuration"
      }
    }
  }
}
```

## Add MCP servers from JSON

```bash
claude mcp add-json weather-api '{"type":"http","url":"https://api.weather.com/mcp","headers":{"Authorization":"Bearer token"}}'
```

## Use Claude Code as an MCP server

```bash
claude mcp serve
```

Claude Desktop configuration:

```json
{
  "mcpServers": {
    "claude-code": {
      "type": "stdio",
      "command": "claude",
      "args": ["mcp", "serve"],
      "env": {}
    }
  }
}
```

## MCP output limits

* Warning threshold: 10,000 tokens
* Default maximum: 25,000 tokens
* Configure with `MAX_MCP_OUTPUT_TOKENS` environment variable

## MCP resources

Reference MCP resources with @ mentions: `@server:protocol://resource/path`

```
Can you analyze @github:issue://123 and suggest a fix?
```

## MCP Tool Search

Automatically enabled when MCP tool descriptions exceed 10% of context window.

Configure with `ENABLE_TOOL_SEARCH`:
| Value      | Behavior                                           |
| :--------- | :------------------------------------------------- |
| `auto`     | Activates at 10% threshold (default)               |
| `auto:<N>` | Custom threshold percentage                        |
| `true`     | Always enabled                                     |
| `false`    | Disabled, all tools loaded upfront                 |

## MCP prompts as commands

MCP prompts become available as `/mcp__servername__promptname` commands.

## Managed MCP configuration

### Option 1: Exclusive control with `managed-mcp.json`

Deploy to system directories:
* macOS: `/Library/Application Support/ClaudeCode/managed-mcp.json`
* Linux/WSL: `/etc/claude-code/managed-mcp.json`
* Windows: `C:\Program Files\ClaudeCode\managed-mcp.json`

### Option 2: Policy-based allowlists/denylists

Use `allowedMcpServers` and `deniedMcpServers` in managed settings.

Restriction types:
1. **By server name** (`serverName`)
2. **By command** (`serverCommand`): exact command + args match
3. **By URL pattern** (`serverUrl`): wildcard support with `*`

Denylist always takes precedence over allowlist.
