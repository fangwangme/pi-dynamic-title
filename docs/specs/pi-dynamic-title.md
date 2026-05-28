# pi-dynamic-title — Requirements Document

> Extension that dynamically composes terminal window/tab titles from a configurable 5-segment format, reflecting runtime status, active model, and session context.

---

## 1. Goal

Provide an always-visible, at-a-glance summary of Pi's current activity directly in the terminal window title. The title must update in real-time as the agent's state changes (running, finished, model switched, etc.) and must be fully customizable by the user without modifying code.

---

## 2. Functional Requirements

### FR-1 Composable 5-Segment Title

The title is assembled from an ordered list of segments. Exactly these five segments exist:

| Segment | Data source | Example output |
|---------|-----------|----------------|
| `status` | Runtime state | `⠋` (running spinner) or `●` (finished) or empty (idle) |
| `agent` | Config `agentName` | `π` |
| `worktree` | Git worktree/repository root | `pi-dynamic-title` |
| `model` | `shortModelName(model.id)` | `sonnet-4`, `DS-chat` |
| `title` | `pi.getSessionName()` | `Refactor login` |

The user must be able to choose which segments are active and in what order. The default is:

```
[status] [agent] [model] [title]
```

The `worktree` segment is off by default but available as an option.

### FR-2 Animation Isolated from Separator

When the agent is running, the `status` segment is a Braille spinner animation. **The spinner frame and the rest of the title components must be separated by a plain space**, not by the configured separator character.

Example:
```
⠋ π sonnet-4 Refactor login
```

Not:
```
⠋ · π · sonnet-4 · Refactor login
```

### FR-3 Configurable Separator (Global Only)

The separator used between non-status segments must be customizable:
- **Character**: any string (default `·`)
- **Padding**: toggle to add a leading and trailing space around the character (default on)

The separator configuration must be **global across all sessions**, written to `~/.pi/agent/settings.json` under the `dynamicTitle` key. Per-session overrides are not supported.

### FR-4 Model Name Mapping

To save terminal title space, model names derived from `model.id` must be shortened:
- Strip the provider prefix (e.g. `anthropic/claude-sonnet-4` → `claude-sonnet-4`).
- Abbreviate `deepseek` → `DS` (case-insensitive).
- Remove the `claude` sub-string and its adjacent hyphens (e.g. `claude-sonnet-4` → `sonnet-4`);
- Remove the `preview` sub-string and its adjacent hyphens (e.g. `gemini-2.0-flash-preview` → `gemini-2.0-flash`).
- Do **not** normalize version-number hyphens (e.g. `gemini-1-5-pro` must stay as-is).
- Collapse any remaining consecutive hyphens to a single one (e.g. `gpt-4--turbo` → `gpt-4-turbo`).

### FR-5 Simple Session Title

The `title` segment dynamically resolves the session title. It displays the custom renamed session title via `pi.getSessionName()`. If no custom name has been set, it falls back to the first user prompt message text from the session history. If no messages exist yet in the session, it falls back to the resolved `worktree` name. There is no external LLM-based title generation.

### FR-6 Title Override Protection

Other extensions or the Pi core may call `ctx.ui.setTitle()` to set a raw title. The extension must intercept these calls, sanitize them, and re-render the structured 5-segment title instead of allowing the raw title to overwrite the terminal completely.

### FR-7 Focus-Aware Completion State (DECSET 1004)

When an agent task finishes:
- The title shows `●` in the status segment.
- If the user focuses the terminal window (detected via `\x1b[I`), the finished state (`●`) must immediately clear to idle, regardless of configured timeout.
- If the terminal does not support focus events, the finished state must clear automatically after `successDurationMs` (configurable, default 5000 ms).

The extension must send terminal escape sequences (`\x1b[?1004h` and `\x1b[?1004l`) only when running in an interactive TTY (`process.stdout.isTTY`).

### FR-8 Non-TTY Safety

The extension must not write terminal control sequences when `process.stdout.isTTY` is false (e.g. Pi RPC/print modes where stdout is reserved for JSONL or final output).

---

## 3. Configuration Requirements

All settings live under the `dynamicTitle` key in `~/.pi/agent/settings.json` (global) or `.pi/settings.json` (project-specific, lower priority).

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `segments` | `string[]` | `["status","agent","model","title"]` | Ordered segment list |
| `agentName` | `string` | `"π"` | Display name for the agent segment |
| `animationInterval` | `number` | `80` | Milliseconds between spinner frames |
| `successDurationMs` | `number` | `5000` | How long to show `●` if no focus events |
| `spinnerFrames` | `string[]` | Braille frames | Characters for the running spinner |
| `separatorChar` | `string` | `"·"` | Joining character between segments |
| `separatorPadding` | `boolean` | `true` | Add spaces around `separatorChar` |
| `maxTitleLength` | `number` | `50` | Max characters per segment before truncating with `…` |

Environment variables (highest priority, optional):
- `PI_DYNAMIC_TITLE_SEGMENTS`: space-separated segment list override
- `PI_DYNAMIC_TITLE_AGENT_NAME`: override `agentName`

---

## 4. Command Interface

The extension must register a `/dynamic-title` command with the following subcommands:

- **`/dynamic-title segments`**: Opens an interactive menu to select a preset or enter a custom space-separated segment list. Changes are saved to global `settings.json`.
- **`/dynamic-title separator`**: Opens an interactive menu to select a separator character and toggle padding. Changes are saved to global `settings.json`.
- **`/dynamic-title rename`**: Prompts the user to rename the session (sets `pi.setSessionName`).
- **`/dynamic-title`** (no args): Opens a top-level menu with the above options plus "Show Config".

---

## 5. Non-Functional Requirements

- **No External Network Dependency**: No LLM calls, no API keys, no HTTP requests.
- **Single Extension Instance**: State variables live in module scope; no multi-session isolation is required.
- **TypeScript NoEmit Clean**: Must compile with `tsc --noEmit` with zero errors.
