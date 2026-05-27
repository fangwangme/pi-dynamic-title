# pi-dynamic-title

Pi Coding Agent Extension that dynamically updates your terminal window/tab title to provide instant status, project context, and workspace feedback.

## Features

- **5-Segment Composable Title**: Customize your title layout from five available segments:
  - `status`: Clean status indicator (Braille spinner for running, `●` for success, `!` for needs auth, `✗` for errors, empty when idle).
  - `agent`: Agent display name (defaults to `π`).
  - `worktree`: Git worktree / repository top-level directory name (defaults to CWD basename if outside Git).
  - `model`: Short name of the currently active model (e.g. `claude-sonnet-4`).
  - `title`: Direct display of the Pi Session Name.
- **No LLM Dependencies**: Completely simplified title displaying. Directly displays the session name (with worktree name fallback if empty). Zero API network calls, zero API-key dependencies, and zero latency.
- **Smart Fallback & Duplication Guard**:
  - If the `worktree` segment is **not** active, the `title` segment automatically falls back to the Git worktree/repository name when no explicit session name is set.
  - If both `worktree` and `title` segments are active, duplication is automatically guarded: the `title` segment remains empty until you explicitly rename the session.
- **Authorization Gating Capture**: Intercepts confirmation and selection TUI dialogs dynamically to toggle status to `needs_auth` (`!`) and send notifications.
- **Focus Detection (DECSET 1004)**: Consumes focus-in/out escapes to instantly clear the success indicator `●` when the user refocuses the terminal window.
- **Terminal & System Notifications**: Dual-track notification support sending OSC 9 native terminal commands and falls back to macOS `osascript` notifications if user focus remains away for 10 seconds.
- **Interactive Commands**: Exposes `/dynamic-title` command with subcommands:
  - `/dynamic-title segments`: Select segment presets (e.g. status only, status | worktree | title, etc.) or enter custom layouts.
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
    "notifyOnAuth": true,
    "notifyMinDurationMs": 5000
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
