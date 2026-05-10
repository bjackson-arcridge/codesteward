# Claude Agent SDK — API Reference for Sundial

> This document summarizes the key API surfaces of the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) relevant to building Sundial. Each section links to the authoritative source documentation. The SDK was formerly known as the "Claude Code SDK" and has been renamed.

**SDK Packages:**
- TypeScript: `@anthropic-ai/claude-agent-sdk` ([npm](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk))
- Python: `claude-agent-sdk` ([PyPI](https://pypi.org/project/claude-agent-sdk/))

**Source repos:**
- TypeScript SDK: https://github.com/anthropics/claude-agent-sdk-typescript
- Python SDK: https://github.com/anthropics/claude-agent-sdk-python
- Claude Code (plugins/examples): https://github.com/anthropics/claude-code

---

## Table of Contents

1. [Core Functions](#1-core-functions)
2. [Options (Configuration)](#2-options-configuration)
3. [Query Object (Session Control)](#3-query-object-session-control)
4. [System Prompt Configuration](#4-system-prompt-configuration)
5. [Permission System](#5-permission-system)
6. [Hook System](#6-hook-system)
7. [Message Types (Streaming Events)](#7-message-types-streaming-events)
8. [MCP / Custom Tools](#8-mcp--custom-tools)
9. [Subagents](#9-subagents)
10. [Sessions](#10-sessions)
11. [Streaming vs Single Mode](#11-streaming-vs-single-mode)
12. [Built-in Tools & Input Types](#12-built-in-tools--input-types)
13. [Plugin System](#13-plugin-system)

---

## 1. Core Functions

> [TypeScript SDK Reference](https://platform.claude.com/docs/en/agent-sdk/typescript)

### `query()`

The primary entry point. Returns an async generator that streams `SDKMessage` events.

```typescript
function query({
  prompt,
  options
}: {
  prompt: string | AsyncIterable<SDKUserMessage>;
  options?: Options;
}): Query;
```

- `prompt` as `string`: single-shot mode (one prompt, one response)
- `prompt` as `AsyncIterable<SDKUserMessage>`: streaming input mode (multi-turn, supports images, interrupts, hooks, `canUseTool`)

### `tool()`

Creates a type-safe MCP tool definition using Zod schemas (v3 or v4).

```typescript
function tool<Schema extends AnyZodRawShape>(
  name: string,
  description: string,
  inputSchema: Schema,
  handler: (args: InferShape<Schema>, extra: unknown) => Promise<CallToolResult>,
  extras?: { annotations?: ToolAnnotations }
): SdkMcpToolDefinition<Schema>;
```

### `createSdkMcpServer()`

Creates an in-process MCP server (no subprocess needed).

```typescript
function createSdkMcpServer(options: {
  name: string;
  version?: string;
  tools?: Array<SdkMcpToolDefinition<any>>;
}): McpSdkServerConfigWithInstance;
```

### `listSessions()` / `getSessionMessages()`

Discover past sessions and read their transcripts.

```typescript
function listSessions(options?: { dir?: string; limit?: number }): Promise<SDKSessionInfo[]>;
function getSessionMessages(sessionId: string, options?: { dir?: string; limit?: number; offset?: number }): Promise<SessionMessage[]>;
```

---

## 2. Options (Configuration)

> [TypeScript SDK Reference — Options](https://platform.claude.com/docs/en/agent-sdk/typescript#options)

The `Options` object passed to `query()`. Key properties for Sundial:

| Property | Type | Default | Relevance |
|---|---|---|---|
| `systemPrompt` | `string \| { type: 'preset'; preset: 'claude_code'; append?: string }` | minimal prompt | **Critical** — sets agent framing |
| `hooks` | `Partial<Record<HookEvent, HookCallbackMatcher[]>>` | `{}` | **Critical** — decision point interception |
| `canUseTool` | `CanUseTool` callback | `undefined` | **Critical** — per-tool permission UI |
| `permissionMode` | `PermissionMode` | `'default'` | Controls auto-approval scope |
| `allowedTools` | `string[]` | `[]` | Pre-approve specific tools |
| `disallowedTools` | `string[]` | `[]` | Always deny (overrides everything) |
| `mcpServers` | `Record<string, McpServerConfig>` | `{}` | **Critical** — DR governance tools |
| `agents` | `Record<string, AgentDefinition>` | `undefined` | Define custom subagents |
| `settingSources` | `('user' \| 'project' \| 'local')[]` | `[]` | Load CLAUDE.md, settings.json |
| `resume` | `string` | `undefined` | Session ID to resume |
| `sessionId` | `string` | auto-generated | Fix session ID |
| `maxTurns` | `number` | `undefined` | Limit agentic round-trips |
| `maxBudgetUsd` | `number` | `undefined` | Cost cap |
| `includePartialMessages` | `boolean` | `false` | Stream token-by-token events |
| `model` | `string` | CLI default | Model selection |
| `effort` | `'low' \| 'medium' \| 'high' \| 'max'` | `'high'` | Thinking depth |
| `plugins` | `SdkPluginConfig[]` | `[]` | Load plugins from paths |
| `tools` | `string[] \| { type: 'preset'; preset: 'claude_code' }` | `undefined` | Tool configuration |
| `cwd` | `string` | `process.cwd()` | Working directory |
| `env` | `Record<string, string \| undefined>` | `process.env` | Environment vars |
| `outputFormat` | `{ type: 'json_schema'; schema: JSONSchema }` | `undefined` | Structured output |
| `enableFileCheckpointing` | `boolean` | `false` | File rewind support |
| `abortController` | `AbortController` | new | Cancel operations |

---

## 3. Query Object (Session Control)

> [TypeScript SDK Reference — Query](https://platform.claude.com/docs/en/agent-sdk/typescript#query-object)

`query()` returns a `Query` object that extends `AsyncGenerator<SDKMessage, void>` with control methods:

```typescript
interface Query extends AsyncGenerator<SDKMessage, void> {
  // Session control
  interrupt(): Promise<void>;
  close(): void;

  // Dynamic reconfiguration (streaming mode only)
  setPermissionMode(mode: PermissionMode): Promise<void>;
  setModel(model?: string): Promise<void>;
  streamInput(stream: AsyncIterable<SDKUserMessage>): Promise<void>;

  // File management
  rewindFiles(userMessageId: string, options?: { dryRun?: boolean }): Promise<RewindFilesResult>;

  // Introspection
  initializationResult(): Promise<SDKControlInitializeResponse>;
  supportedCommands(): Promise<SlashCommand[]>;
  supportedModels(): Promise<ModelInfo[]>;
  supportedAgents(): Promise<AgentInfo[]>;
  mcpServerStatus(): Promise<McpServerStatus[]>;
  accountInfo(): Promise<AccountInfo>;

  // MCP management
  reconnectMcpServer(serverName: string): Promise<void>;
  toggleMcpServer(serverName: string, enabled: boolean): Promise<void>;
  setMcpServers(servers: Record<string, McpServerConfig>): Promise<McpSetServersResult>;

  // Task management
  stopTask(taskId: string): Promise<void>;
}
```

**Key for Sundial:**
- `streamInput()` — inject messages mid-session (for decision point responses)
- `interrupt()` — pause agent when decision point requires human input
- `setPermissionMode()` — dynamically adjust permission level

---

## 4. System Prompt Configuration

> [System Prompts Guide](https://platform.claude.com/docs/en/agent-sdk/modifying-system-prompts)

Three modes of system prompt configuration:

### Preset with Append (Recommended for Sundial)
```typescript
systemPrompt: {
  type: "preset",
  preset: "claude_code",
  append: "You are operating within an engineering workflow where..."
}
```
This preserves Claude Code's built-in tools, safety instructions, and coding guidelines, while adding the Sundial principal-agent framing.

### Custom String (Full Replacement)
```typescript
systemPrompt: "You are a code executor under engineer authority..."
```
Replaces the entire system prompt. Loses built-in tool instructions and safety checks.

### CLAUDE.md Files
Project-level instructions loaded from `CLAUDE.md` or `.claude/CLAUDE.md`. **Requires** `settingSources: ['project']` to be set.

### Important Notes
- The SDK uses a **minimal** system prompt by default (no Claude Code guidelines)
- `preset: 'claude_code'` loads the full Claude Code system prompt
- `append` adds to the preset; it does NOT replace it
- CLAUDE.md requires BOTH `preset: 'claude_code'` AND `settingSources: ['project']`

---

## 5. Permission System

> [Permissions Guide](https://platform.claude.com/docs/en/agent-sdk/permissions)
> [User Input & Approvals](https://platform.claude.com/docs/en/agent-sdk/user-input)

### Evaluation Order
1. **Hooks** (`PreToolUse`) — can allow/deny/modify
2. **Deny rules** (`disallowedTools`) — always checked, overrides everything
3. **Permission mode** — global policy
4. **Allow rules** (`allowedTools`) — pre-approved tools
5. **`canUseTool` callback** — runtime decision (user prompt)

### Permission Modes

```typescript
type PermissionMode =
  | "default"            // No auto-approvals; falls through to canUseTool
  | "dontAsk"            // Deny if not pre-approved (TS only)
  | "acceptEdits"        // Auto-accept file edits
  | "bypassPermissions"  // Auto-approve everything (use with caution)
  | "plan";              // No execution; planning only
```

### `canUseTool` Callback

Called when a tool isn't resolved by hooks/rules/mode. This is the key integration point for Sundial's approval UI.

```typescript
type CanUseTool = (
  toolName: string,
  input: Record<string, unknown>,
  options: {
    signal: AbortSignal;
    suggestions?: PermissionUpdate[];
    blockedPath?: string;
    decisionReason?: string;
    toolUseID: string;
    agentID?: string;
  }
) => Promise<PermissionResult>;

type PermissionResult =
  | { behavior: "allow"; updatedInput?: Record<string, unknown>; updatedPermissions?: PermissionUpdate[] }
  | { behavior: "deny"; message: string; interrupt?: boolean };
```

**Sundial usage:** The `canUseTool` callback is where we surface tool requests to the VSCode UI, allow the user to approve/deny/edit, and return the decision.

---

## 6. Hook System

> [Hooks Guide](https://platform.claude.com/docs/en/agent-sdk/hooks)
> [TypeScript Hook Types](https://platform.claude.com/docs/en/agent-sdk/typescript#hook-types)

### Available Hook Events

```typescript
type HookEvent =
  | "PreToolUse"           // Before tool execution — can block/modify/allow
  | "PostToolUse"          // After tool execution — can inject context
  | "PostToolUseFailure"   // After tool fails
  | "UserPromptSubmit"     // User sends a message — can inject context
  | "Stop"                 // Agent wants to stop — can force continuation
  | "SubagentStart"        // Subagent spawned
  | "SubagentStop"         // Subagent completed
  | "PreCompact"           // Before context compaction
  | "SessionStart"         // Session initialized (TS only)
  | "SessionEnd"           // Session terminated (TS only)
  | "Notification"         // Agent status messages
  | "PermissionRequest"    // Permission dialog triggered
  | "Setup"                // Session setup/maintenance (TS only)
  | "TeammateIdle"         // Teammate becomes idle (TS only)
  | "TaskCompleted"        // Background task done (TS only)
  | "ConfigChange"         // Config file changed (TS only)
  | "WorktreeCreate"       // Git worktree created (TS only)
  | "WorktreeRemove";      // Git worktree removed (TS only)
```

### Hook Configuration

```typescript
hooks: {
  PreToolUse: [
    {
      matcher: "Edit|Write",       // Regex against tool name (optional)
      hooks: [myCallback],         // Array of callbacks
      timeout: 60                  // Timeout in seconds
    }
  ],
  UserPromptSubmit: [
    { hooks: [injectDRContext] }   // No matcher = fires for all
  ],
  Stop: [
    { hooks: [reviewHook] }
  ]
}
```

### Hook Callback Signature

```typescript
type HookCallback = (
  input: HookInput,                    // Event-specific data
  toolUseID: string | undefined,       // Correlates Pre/PostToolUse
  options: { signal: AbortSignal }
) => Promise<HookJSONOutput>;
```

### Hook Input Types (Key Ones for Sundial)

```typescript
type PreToolUseHookInput = BaseHookInput & {
  hook_event_name: "PreToolUse";
  tool_name: string;
  tool_input: unknown;
  tool_use_id: string;
};

type UserPromptSubmitHookInput = BaseHookInput & {
  hook_event_name: "UserPromptSubmit";
  prompt: string;
};

type StopHookInput = BaseHookInput & {
  hook_event_name: "Stop";
  stop_hook_active: boolean;
  last_assistant_message?: string;
};

type BaseHookInput = {
  session_id: string;
  transcript_path: string;
  cwd: string;
  permission_mode?: string;
  agent_id?: string;       // Present in subagent context
  agent_type?: string;
};
```

### Hook Output (Return Values)

```typescript
type SyncHookJSONOutput = {
  continue?: boolean;                    // Force agent to continue (Stop hook)
  suppressOutput?: boolean;
  stopReason?: string;
  decision?: "approve" | "block";
  systemMessage?: string;                // Inject into conversation (model sees this)
  reason?: string;
  hookSpecificOutput?:
    | {
        hookEventName: "PreToolUse";
        permissionDecision?: "allow" | "deny" | "ask";
        permissionDecisionReason?: string;
        updatedInput?: Record<string, unknown>;
        additionalContext?: string;        // Appended to tool result
      }
    | {
        hookEventName: "UserPromptSubmit";
        additionalContext?: string;        // Added to prompt context
      }
    | {
        hookEventName: "PostToolUse";
        additionalContext?: string;
        updatedMCPToolOutput?: unknown;
      }
    // ... other event-specific outputs
};
```

### Sundial Hook Wiring Plan

| Hook | Purpose |
|---|---|
| `UserPromptSubmit` | Inject DR index summary as `additionalContext` |
| `PreToolUse` (matcher: `mcp__.*signal_decision_point`) | Read pending decision, check agency config, block/allow per supervision level |
| `Stop` | Return `{ continue: true }` + inject review request for pending items |
| `PostToolUse` | Log tool outcomes for DR audit trail |

**Priority rule:** When multiple hooks fire, `deny` > `ask` > `allow`.

---

## 7. Message Types (Streaming Events)

> [TypeScript SDK Reference — Message Types](https://platform.claude.com/docs/en/agent-sdk/typescript#message-types)

All messages streamed from `query()`:

```typescript
type SDKMessage =
  | SDKAssistantMessage         // Model response (contains BetaMessage from Anthropic SDK)
  | SDKUserMessage              // User input
  | SDKUserMessageReplay        // Replayed message (on resume)
  | SDKResultMessage            // Final result (success or error)
  | SDKSystemMessage            // Init message (session_id, tools, model, etc.)
  | SDKPartialAssistantMessage  // Token-by-token streaming (if includePartialMessages)
  | SDKCompactBoundaryMessage   // Context compaction boundary
  | SDKStatusMessage            // Status updates
  | SDKHookStartedMessage       // Hook execution started
  | SDKHookProgressMessage      // Hook progress
  | SDKHookResponseMessage      // Hook result
  | SDKToolProgressMessage      // Tool execution progress
  | SDKAuthStatusMessage        // Auth status
  | SDKTaskNotificationMessage  // Background task notification
  | SDKTaskStartedMessage       // Task started
  | SDKTaskProgressMessage      // Task progress
  | SDKFilesPersistedEvent      // Files saved
  | SDKToolUseSummaryMessage    // Tool use summary
  | SDKRateLimitEvent           // Rate limit hit
  | SDKPromptSuggestionMessage; // Suggested next prompt
```

### Key Message Types

**`SDKSystemMessage` (init)** — First message, contains session metadata:
```typescript
{
  type: "system"; subtype: "init";
  session_id: string;
  tools: string[];
  model: string;
  mcp_servers: { name: string; status: string }[];
  permissionMode: PermissionMode;
  // ...
}
```

**`SDKAssistantMessage`** — Model response:
```typescript
{
  type: "assistant";
  uuid: UUID;
  session_id: string;
  message: BetaMessage;             // From @anthropic-ai/sdk
  parent_tool_use_id: string | null; // Non-null = subagent context
}
```

**`SDKResultMessage`** — Final outcome:
```typescript
{
  type: "result";
  subtype: "success" | "error_max_turns" | "error_during_execution" | "error_max_budget_usd";
  result: string;                    // On success
  total_cost_usd: number;
  num_turns: number;
  duration_ms: number;
  usage: NonNullableUsage;
  permission_denials: SDKPermissionDenial[];
  structured_output?: unknown;       // If outputFormat was set
}
```

**`SDKPartialAssistantMessage`** — Streaming tokens (requires `includePartialMessages: true`):
```typescript
{
  type: "stream_event";
  event: BetaRawMessageStreamEvent;  // From Anthropic SDK
  parent_tool_use_id: string | null;
}
```

---

## 8. MCP / Custom Tools

> [Custom Tools Guide](https://platform.claude.com/docs/en/agent-sdk/custom-tools)
> [TypeScript SDK — MCP Config](https://platform.claude.com/docs/en/agent-sdk/typescript#mcpserverconfig)

### In-Process SDK MCP Server (Critical for Sundial)

This is how we implement `consult_drs`, `signal_decision_point`, and `propose_dr`.

```typescript
import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const drServer = createSdkMcpServer({
  name: "dr-governance",
  version: "1.0.0",
  tools: [
    tool(
      "consult_drs",
      "Search decision records for relevant prior decisions",
      { query: z.string().describe("Search query for decision records") },
      async (args) => {
        // Implementation: search DR store
        return { content: [{ type: "text", text: "..." }] };
      }
    ),
    tool(
      "signal_decision_point",
      "Surface a decision to the engineer before committing",
      {
        dimension: z.enum([...]),
        description: z.string(),
        alternatives: z.array(z.string()),
        confidence: z.enum(["low", "medium", "high"]),
        relevant_dr_ids: z.array(z.string())
      },
      async (args) => { /* ... */ }
    )
  ]
});
```

### MCP Server Config Types

```typescript
type McpServerConfig =
  | McpStdioServerConfig           // { command, args?, env? }
  | McpSSEServerConfig             // { type: "sse", url, headers? }
  | McpHttpServerConfig            // { type: "http", url, headers? }
  | McpSdkServerConfigWithInstance; // { type: "sdk", name, instance } — in-process

// Pass to query:
mcpServers: {
  "dr-governance": drServer   // In-process SDK server
}
```

### Tool Naming Convention
MCP tools are exposed to Claude as `mcp__{server_name}__{tool_name}`. For example:
- `mcp__dr-governance__consult_drs`
- `mcp__dr-governance__signal_decision_point`

### Important Notes
- Custom MCP tools **require streaming input mode** (async generator prompt)
- Use `allowedTools` to pre-approve: `["mcp__dr-governance__consult_drs"]`
- If tools run longer than 60s, set `CLAUDE_CODE_STREAM_CLOSE_TIMEOUT`

---

## 9. Subagents

> [SDK Overview — Subagents](https://platform.claude.com/docs/en/agent-sdk/overview)

Define custom subagents that the main agent can invoke via the `Task` tool:

```typescript
agents: {
  "code-reviewer": {
    description: "Expert code reviewer for quality reviews",
    prompt: "Analyze code quality and suggest improvements.",
    tools: ["Read", "Glob", "Grep"],
    model: "sonnet",          // "sonnet" | "opus" | "haiku" | "inherit"
    maxTurns: 10,
    mcpServers: ["dr-governance"],  // Reference parent's MCP servers by name
    skills: [],
    disallowedTools: [],
    criticalSystemReminder_EXPERIMENTAL: ""
  }
}
```

- Include `"Task"` in `allowedTools` to let the main agent spawn subagents
- Messages from subagents have `parent_tool_use_id` set (non-null)
- Hooks fire within subagent context with `agent_id` in `BaseHookInput`
- `bypassPermissions` is inherited by all subagents and **cannot be overridden**

---

## 10. Sessions

> [SDK Overview — Sessions](https://platform.claude.com/docs/en/agent-sdk/overview)

Sessions maintain conversation context across multiple exchanges.

```typescript
// Capture session ID from init message
let sessionId: string;
for await (const msg of query({ prompt: "Read auth module" })) {
  if (msg.type === "system" && msg.subtype === "init") {
    sessionId = msg.session_id;
  }
}

// Resume with full context
for await (const msg of query({
  prompt: "Find all callers",
  options: { resume: sessionId }
})) { /* ... */ }

// Fork (new session, same context)
options: { resume: sessionId, forkSession: true }
```

- `persistSession: false` disables disk persistence (session can't be resumed)
- `sessionId` lets you specify a UUID instead of auto-generating

---

## 11. Streaming vs Single Mode

> [Streaming Guide](https://platform.claude.com/docs/en/agent-sdk/streaming-vs-single-mode)

### Streaming Input Mode (Required for Sundial)
- Pass `AsyncIterable<SDKUserMessage>` as `prompt`
- Enables: images, multi-turn, hooks, `canUseTool`, `streamInput()`, interrupts
- Required for MCP custom tools

```typescript
async function* generateMessages() {
  yield {
    type: "user" as const,
    message: { role: "user" as const, content: "Analyze this codebase" }
  };
  // Yield more messages as user provides input
}

const q = query({ prompt: generateMessages(), options: { /* ... */ } });
for await (const msg of q) { /* ... */ }
```

### `streamInput()` for Mid-Session Injection
```typescript
// After query is running, inject additional messages:
await q.streamInput(async function*() {
  yield {
    type: "user",
    message: { role: "user", content: "Actually, focus on the auth module" }
  };
}());
```

### Single Message Mode
- Pass `string` as `prompt`
- Limited: no hooks integration, no images, no interrupts
- Use `continue: true` or `resume: sessionId` for multi-turn

---

## 12. Built-in Tools & Input Types

> [TypeScript SDK — Tool Input Types](https://platform.claude.com/docs/en/agent-sdk/typescript#tool-input-types)

All input types are exported from `@anthropic-ai/claude-agent-sdk`:

| Tool | Key Input Fields |
|---|---|
| `Bash` | `command`, `description?`, `timeout?`, `run_in_background?` |
| `Read` | `file_path`, `offset?`, `limit?`, `pages?` |
| `Write` | `file_path`, `content` |
| `Edit` | `file_path`, `old_string`, `new_string`, `replace_all?` |
| `Glob` | `pattern`, `path?` |
| `Grep` | `pattern`, `path?`, `glob?`, `type?`, `output_mode?` |
| `WebFetch` | `url`, `prompt` |
| `WebSearch` | `query`, `domain?` |
| `Task` (Agent) | `description`, `prompt`, `subagent_type`, `model?`, `run_in_background?` |
| `AskUserQuestion` | `questions[]` with `question`, `header`, `options[]`, `multiSelect` |
| `TodoWrite` | `todos[]` with `content`, `status`, `activeForm` |

---

## 13. Plugin System

> [Plugins Documentation](https://platform.claude.com/docs/en/agent-sdk/plugins)
> [Plugin Directory](https://github.com/anthropics/claude-code/tree/main/plugins)

Plugins extend Claude Code with custom commands, agents, skills, hooks, and MCP servers.

### Plugin Structure
```
plugin-name/
├── .claude-plugin/
│   └── plugin.json          # Metadata
├── commands/                # Slash commands (.md)
├── agents/                  # Specialized agents (.md)
├── skills/                  # Agent skills (.md)
├── hooks/                   # Event handlers
│   ├── hooks.json
│   └── *.py / *.sh
├── .mcp.json                # MCP server config
└── README.md
```

### Loading Plugins in SDK
```typescript
plugins: [
  { type: "local", path: "./my-plugin" },
  { type: "local", path: "/absolute/path/to/plugin" }
]
```

---

## Quick Reference: Sundial Integration Points

| Sundial Need | SDK Mechanism | Key API |
|---|---|---|
| Principal-agent framing | System prompt append | `systemPrompt: { preset: 'claude_code', append: '...' }` |
| DR governance tools | In-process MCP server | `createSdkMcpServer()` + `tool()` |
| Decision point blocking | PreToolUse hook + canUseTool | `hooks.PreToolUse` → `permissionDecision: 'deny'` |
| Inject DR context | UserPromptSubmit hook | `hookSpecificOutput.additionalContext` |
| Force review at stop | Stop hook | `{ continue: true, systemMessage: '...' }` |
| User approval UI | canUseTool callback | `PermissionResult: allow/deny` |
| Mid-session input | streamInput | `query.streamInput(asyncIterable)` |
| Multi-turn sessions | Session resume | `options.resume = sessionId` |
| Supervision levels | System prompt + hook config | Different append per level + agency config |
| Code diff review | canUseTool for Edit/Write | `toolName === 'Edit'` → surface diff to user |

---

## Documentation Links Index

| Topic | URL |
|---|---|
| SDK Overview | https://platform.claude.com/docs/en/agent-sdk/overview |
| TypeScript Reference | https://platform.claude.com/docs/en/agent-sdk/typescript |
| TypeScript V2 Preview | https://platform.claude.com/docs/en/agent-sdk/typescript-v2-preview |
| Python Reference | https://platform.claude.com/docs/en/agent-sdk/python |
| Hooks Guide | https://platform.claude.com/docs/en/agent-sdk/hooks |
| Permissions Guide | https://platform.claude.com/docs/en/agent-sdk/permissions |
| User Input / Approvals | https://platform.claude.com/docs/en/agent-sdk/user-input |
| System Prompts | https://platform.claude.com/docs/en/agent-sdk/modifying-system-prompts |
| Streaming vs Single Mode | https://platform.claude.com/docs/en/agent-sdk/streaming-vs-single-mode |
| Custom Tools (MCP) | https://platform.claude.com/docs/en/agent-sdk/custom-tools |
| Subagents | https://platform.claude.com/docs/en/agent-sdk/subagents |
| Sessions | https://platform.claude.com/docs/en/agent-sdk/sessions |
| Structured Outputs | https://platform.claude.com/docs/en/agent-sdk/structured-outputs |
| File Checkpointing | https://platform.claude.com/docs/en/agent-sdk/file-checkpointing |
| Plugins | https://platform.claude.com/docs/en/agent-sdk/plugins |
| Skills | https://platform.claude.com/docs/en/agent-sdk/skills |
| Quickstart | https://platform.claude.com/docs/en/agent-sdk/quickstart |
| Example Agents | https://github.com/anthropics/claude-agent-sdk-demos |
| TS SDK Changelog | https://github.com/anthropics/claude-agent-sdk-typescript/blob/main/CHANGELOG.md |
| Python SDK Changelog | https://github.com/anthropics/claude-agent-sdk-python/blob/main/CHANGELOG.md |
| TS SDK Issues | https://github.com/anthropics/claude-agent-sdk-typescript/issues |
| Claude Code Repo | https://github.com/anthropics/claude-code |
