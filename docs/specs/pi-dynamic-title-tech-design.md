# Pi Dynamic Title Extension — Technical Design Document

This document outlines the architecture, data flow, and design specifications for the `pi-dynamic-title` extension.

---

## 1. Title Structure

The window title is composed of up to 5 segments configured in order:
`[status] | [agent] | [worktree] | [model] | [title]`

Segments are joined by a customizable separator character (default is ` · ` with padding).

### 1.1 Status Indicator

Only two runtime statuses are displayed:
- **Running**: A Braille spinner frame animation (e.g. `⠋`).
- **Finished (Idle / Completed)**: When an agent task finishes, a completion dot (`●`) is shown.
  - **Focus-In Dismissal**: Clicking or focusing into the terminal window instantly clears the `●` indicator (resets status to `"idle"`). If already focused, it fades out automatically after 2 seconds.
  - **No Focus API Fallback**: If the terminal does not support focus events (or hasn't reported any yet), the dot automatically fades out after 5 seconds.
  - **Focus API Detection**: The extension dynamically detects focus event support upon receiving the first focus-in/out escape sequences (`\x1b[I` or `\x1b[O`).

### 1.2 Model Names
Model IDs are trimmed to their base names and explicitly abbreviated to save screen space:
- Provider path prefix is stripped (e.g., `anthropic/claude-sonnet-4` -> `claude-sonnet-4`).
- **Deepseek** is abbreviated to `DS` (case-insensitive, e.g., `deepseek-chat` -> `DS-chat`).
- **Claude** (and its adjacent hyphens) is explicitly removed (e.g., `claude-sonnet-4` -> `sonnet-4`, `claude` -> `""`).
- **Preview** (and its adjacent hyphens) is explicitly removed (e.g., `gemini-2.0-flash-exp-preview` -> `gemini-2.0-flash-exp`).
- Targeted replacements are used instead of generic dash normalization to preserve version hyphens (such as in `gemini-1-5-pro`).

### 1.3 Session Title Resolution

The session title (`title` segment) is dynamically evaluated at formatting time using the following order of precedence:
1. **Custom Name**: The display name set by the user (retrieved via `pi.getSessionName()`).
2. **First Prompt Fallback**: If no custom name is set, the extension extracts the text content of the first message with role `"user"` from the active conversation branch (`ctx.sessionManager.getBranch()`).
3. **Worktree Fallback**: If no prompt messages exist, it falls back to the resolved `worktreeName` (directory name of the Git repository/worktree or current directory basename).

---

## 2. Configuration Options

### 2.1 Configuration Keys

```typescript
export interface DynamicTitleConfig {
  segments: ("status" | "agent" | "worktree" | "model" | "title")[];
  agentName: string;
  animationInterval: number;
  successDurationMs: number; // Used as fallback timeout
  spinnerFrames: string[];
  notifications: boolean;
  notifyOnComplete: boolean;
  notifyMinDurationMs: number;
  separatorChar: string;
  separatorPadding: boolean;
  maxTitleLength: number;
}
```

### 2.2 Command Actions
The subcommand `/dynamic-title` provides interactive setup:
- `/dynamic-title segments` — Configures enabled segments.
- `/dynamic-title separator` — Selects separator character and toggles padding.
- `/dynamic-title rename` — Manually overrides or resets the session name using Earendil's `pi.setSessionName` API.

---

## 3. UI Interception

- **Interception of setTitle**: To prevent race conditions with Earendil's built-in title overrides, the extension wraps `ctx.ui.setTitle` using `Object.defineProperty`. It intercepts external title updates, sanitizes them, and re-renders the structured title dynamically. It does not parse or store the raw input title, but enforces the structured 5-segment title formatting. No wrappers are applied to `ui.confirm` or `ui.select` to avoid state leaks.
