# Extend Claude with skills

> Create, manage, and share skills to extend Claude's capabilities in Claude Code.

Source: https://code.claude.com/docs/en/skills

Skills extend what Claude can do. Create a `SKILL.md` file with instructions, and Claude adds it to its toolkit. Claude uses skills when relevant, or you can invoke one directly with `/skill-name`.

Claude Code skills follow the Agent Skills open standard (agentskills.io). Claude Code extends it with invocation control, subagent execution, and dynamic context injection.

## Bundled skills

* **`/simplify`**: reviews changed files for code reuse, quality, and efficiency, then fixes issues. Spawns three review agents in parallel.
* **`/batch <instruction>`**: orchestrates large-scale changes across a codebase in parallel using git worktrees.
* **`/debug [description]`**: troubleshoots your current session by reading the debug log.
* **`/loop [interval] <prompt>`**: runs a prompt repeatedly on an interval.
* **`/claude-api`**: loads Claude API reference material. Also activates automatically when code imports `anthropic`, `@anthropic-ai/sdk`, or `claude_agent_sdk`.

## Where skills live

| Location   | Path                                                | Applies to                     |
| :--------- | :-------------------------------------------------- | :----------------------------- |
| Enterprise | See managed settings                                | All users in your organization |
| Personal   | `~/.claude/skills/<skill-name>/SKILL.md`            | All your projects              |
| Project    | `.claude/skills/<skill-name>/SKILL.md`              | This project only              |
| Plugin     | `<plugin>/skills/<skill-name>/SKILL.md`             | Where plugin is enabled        |

Priority: enterprise > personal > project. Plugin skills use `plugin-name:skill-name` namespace.

### Automatic discovery from nested directories

When working in subdirectories, Claude Code discovers skills from nested `.claude/skills/` directories (supports monorepos).

### Skill directory structure

```
my-skill/
├── SKILL.md           # Main instructions (required)
├── template.md        # Template for Claude to fill in
├── examples/
│   └── sample.md      # Example output showing expected format
└── scripts/
    └── validate.sh    # Script Claude can execute
```

## Frontmatter reference

```yaml
---
name: my-skill
description: What this skill does
disable-model-invocation: true
allowed-tools: Read, Grep
---

Your skill instructions here...
```

| Field                      | Required    | Description                                                                  |
| :------------------------- | :---------- | :--------------------------------------------------------------------------- |
| `name`                     | No          | Display name (defaults to directory name). Max 64 chars.                     |
| `description`              | Recommended | What the skill does and when to use it.                                      |
| `argument-hint`            | No          | Hint for autocomplete, e.g., `[issue-number]`.                               |
| `disable-model-invocation` | No          | `true` prevents Claude from auto-loading this skill. Default: `false`.       |
| `user-invocable`           | No          | `false` hides from `/` menu. Default: `true`.                                |
| `allowed-tools`            | No          | Tools Claude can use without asking permission when skill is active.         |
| `model`                    | No          | Model to use when skill is active.                                           |
| `context`                  | No          | Set to `fork` to run in a forked subagent context.                           |
| `agent`                    | No          | Which subagent type to use when `context: fork` is set.                      |
| `hooks`                    | No          | Hooks scoped to this skill's lifecycle.                                      |

## String substitutions

| Variable               | Description                                             |
| :--------------------- | :------------------------------------------------------ |
| `$ARGUMENTS`           | All arguments passed when invoking the skill.           |
| `$ARGUMENTS[N]`        | Specific argument by 0-based index.                     |
| `$N`                   | Shorthand for `$ARGUMENTS[N]`.                          |
| `${CLAUDE_SESSION_ID}` | The current session ID.                                 |
| `${CLAUDE_SKILL_DIR}`  | The directory containing the skill's `SKILL.md` file.   |

## Control who invokes a skill

| Frontmatter                      | You can invoke | Claude can invoke | When loaded into context                                     |
| :------------------------------- | :------------- | :---------------- | :----------------------------------------------------------- |
| (default)                        | Yes            | Yes               | Description always in context, full skill loads when invoked |
| `disable-model-invocation: true` | Yes            | No                | Description not in context, full skill loads when you invoke |
| `user-invocable: false`          | No             | Yes               | Description always in context, full skill loads when invoked |

## Inject dynamic context

The `` !`command` `` syntax runs shell commands before the skill content is sent to Claude:

```yaml
---
name: pr-summary
description: Summarize changes in a pull request
context: fork
agent: Explore
allowed-tools: Bash(gh *)
---

## Pull request context
- PR diff: !`gh pr diff`
- PR comments: !`gh pr view --comments`
- Changed files: !`gh pr diff --name-only`
```

## Run skills in a subagent

Add `context: fork` to run a skill in isolation:

| Approach                     | System prompt                             | Task                        | Also loads                   |
| :--------------------------- | :---------------------------------------- | :-------------------------- | :--------------------------- |
| Skill with `context: fork`   | From agent type (`Explore`, `Plan`, etc.) | SKILL.md content            | CLAUDE.md                    |
| Subagent with `skills` field | Subagent's markdown body                  | Claude's delegation message | Preloaded skills + CLAUDE.md |

The `agent` field specifies which subagent configuration to use. Options include built-in agents (`Explore`, `Plan`, `general-purpose`) or any custom subagent from `.claude/agents/`.

## Restrict Claude's skill access

Three ways:

1. **Disable all skills**: deny `Skill` tool in `/permissions`
2. **Allow/deny specific skills**: `Skill(commit)`, `Skill(review-pr *)`, `Skill(deploy *)`
3. **Hide individual skills**: add `disable-model-invocation: true` to frontmatter

## Share skills

* **Project skills**: Commit `.claude/skills/` to version control
* **Plugins**: Create a `skills/` directory in your plugin
* **Managed**: Deploy organization-wide through managed settings

## Troubleshooting

### Skill not triggering
- Check description includes keywords users would naturally say
- Verify skill appears in `What skills are available?`
- Invoke directly with `/skill-name`

### Skill triggers too often
- Make description more specific
- Add `disable-model-invocation: true`

### Claude doesn't see all skills
- Skills have a character budget of 2% of context window (fallback: 16,000 chars)
- Override with `SLASH_COMMAND_TOOL_CHAR_BUDGET` environment variable
