# Sundial Editor

Sundial Editor is an independently installable VS Code collaboration surface. It turns a source-line `%` command into a focused message composer without writing the message back to your source file.

Marketplace id: `arcridge.sundial-editor`.

## Prompt commands

Type `%` as the first character of a source line. Sundial takes over the triggered completion list with its commands and hides any active inline suggestion while the prefix remains a valid Sundial command. Choosing a completion inserts and immediately submits it:

- `%Q` — question / no-code guidance
- `%1:F` — fix guidance
- `%1:W` — write guidance
- `%1:R` — refactor guidance
- `%2:C` — cleanup guidance
- `%0:T` — test guidance

Each completion has a project-scoped `@G` variant, such as `%1:F @G`. The `%` must be in column zero, making command mode explicit and keeping ordinary `%` characters elsewhere in source code untouched. You can also type a complete command and run **Sundial Editor: Submit Prompt** from the Command Palette.

The command line is removed in one undoable edit and the Messages view opens with the preset and scope shown above the message box. To verify this editor integration before agent delivery exists, the composer is populated with clearly labelled text such as `[Integration stub] Sundial received %1:F for source line 1.` It does not contact an agent or persist a message.

In the message composer, Enter sends the message and Shift+Enter inserts a newline. Both sending and Escape cancellation return focus to the source location, so the complete interaction can stay on the keyboard; the Send and Cancel buttons remain available. When VSCodeVim is enabled, Sundial also returns it to Normal mode so the restored cursor is ready for navigation.

## Sundial Agents panel

Sundial Editor contributes the **Sundial Agents** panel directly to VS Code's right-hand Secondary Side Bar, beside other collaboration surfaces such as Codex and Claude Code. The extension reveals it once on first activation after installation. After that, VS Code remembers whether you close or move it, and Sundial Editor does not reopen it automatically.

## Autosave

The extension contributes default values for VS Code's built-in delayed autosave: `files.autoSave` is `afterDelay` and `files.autoSaveDelay` is 1000 milliseconds. These are defaults only—your user, workspace, folder, and language-specific settings keep their normal precedence.
