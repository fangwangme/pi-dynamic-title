# pi-dynamic-title

Pi Coding Agent Extension that dynamically updates your terminal window/tab title to provide instant status, project context, and workspace feedback.

## Features

- **5-Segment Composable Title**: Customize your title layout from five available segments:
  - `status`: Runtime status indicator. Shows a Braille spinner (e.g. `⠋`) when running, a completion dot `●` when a task finishes, and empty when idle.
  - `agent`: Agent display name (defaults to `π`).
  - `worktree`: Git worktree / repository top-level directory name (defaults to CWD basename if outside Git).
  - `model`: Explicitly mapped short model name (e.g., `sonnet-4`, `DS-chat`, `gemini-2.0-flash`).
  - `title`: Direct display of the Pi Session Name.
- **No LLM Dependencies**: Completely simplified title rendering. Directly displays the session name (with worktree name fallback if empty). Zero API network calls, zero API-key dependencies, and zero latency.
- **Dynamic Model Name Mapping**: Trims model names to save valuable terminal title space:
  - Strip provider path prefix (e.g., `anthropic/claude-sonnet-4` -> `claude-sonnet-4`).
  - Map `deepseek` to `DS` (case-insensitive, e.g., `deepseek-chat` -> `DS-chat`).
  - Remove `claude` and its surrounding hyphens (e.g., `claude-sonnet-4` -> `sonnet-4`).
  - Remove `preview` and its surrounding hyphens (e.g., `gemini-2.0-flash-exp-preview` -> `gemini-2.0-flash-exp`).
  - Retain specific hyphens representing version numbers (e.g. `gemini-1-5-pro` is not normalized).
- **Default Separator & Padding**: Employs a padded mid dot ` · ` (configurable separator character with optional padding spaces around it) to cleanly join enabled segments.
- **Smart Fallback & Duplication Guard**:
  - If the `worktree` segment is **not** active, the `title` segment automatically falls back to the Git worktree/repository name when no explicit session name is set.
  - If both `worktree` and `title` segments are active, duplication is automatically guarded: the `title` segment remains empty until you explicitly rename the session.
- **Focus Detection (DECSET 1004)**: Instantly clears the task completion dot `●` when you refocus the terminal window. If already focused, it falls back to a 5-second automatic timeout.
- **Terminal & System Notifications**: Dual-track notification support: sends terminal OSC 9 commands and falls back to system notifications for long-running tasks.
- **Interactive Commands**: Exposes `/dynamic-title` command with subcommands:
  - `/dynamic-title segments`: Select segment presets or enter custom layouts.
  - `/dynamic-title rename`: Interactively rename the current Pi session name, instantly updating the title.

---

## Default Configuration

By default, the title segments are set to:
`["status", "agent", "model", "title"]`

The `worktree` segment is available as a configurable option but is disabled by default.

---

## Installation

### Local Installation
Copy the built extension folder to your Pi extensions directory:
```bash
cp -r ./dist ~/.pi/agent/extensions/pi-dynamic-title
```
Alternatively, copy it to a project-local configuration folder:
```bash
cp -r ./dist ./.pi/extensions/pi-dynamic-title
```

---

## Configuration

You can customize the extension parameters inside your global `~/.pi/agent/settings.json` or local `.pi/settings.json` under the `dynamicTitle` key:

```json
{
  "dynamicTitle": {
    "segments": ["status", "agent", "worktree", "model", "title"],
    "agentName": "π",
    "animationInterval": 80,
    "successDurationMs": 5000,
    "notifications": true,
    "notifyOnComplete": true,
    "notifyMinDurationMs": 5000,
    "separatorChar": "·",
    "separatorPadding": true
  }
}
```

### Environment Overrides
- `PI_DYNAMIC_TITLE_SEGMENTS`: Override active segments (space-separated, e.g. `status worktree title`).
- `PI_DYNAMIC_TITLE_AGENT_NAME`: Override default agent display name.

---

## Development & Build

Ensure you have [Bun](https://bun.sh) installed.

1. Install dependencies:
   ```bash
   bun install
   ```
2. Build the project:
   ```bash
   bun run build
   ```
3. Run watch mode for development:
   ```bash
   bun run watch
   ```
