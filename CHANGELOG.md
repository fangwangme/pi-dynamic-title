# Changelog

All notable changes to this project will be documented in this file.

## [0.0.1] - 2026-05-27

### Added
- **5-Segment Formatting Engine**: Supports composing titles using `status`, `agent`, `worktree`, `model`, and `title` segments.
- **Git Worktree Resolution**: Resolves the top-level repository or worktree folder name (e.g. `dev` or `pi-dynamic-title`) using `git rev-parse --show-toplevel` as a stable fallback instead of volatile CWD basename paths.
- **Auth Wait Interception**: Intercepts `ctx.ui.confirm` and `ctx.ui.select` dialogs to set the status indicator to `needs_auth` (`!`) and send notifications when authorization is gated.
- **Focus Detection (DECSET 1004)**: Integrates terminal raw focus sequences (`\x1b[I` and `\x1b[O`) to instantly clear completion success dots (`●`) on window focus.
- **Interactive Commands**: Exposes `/dynamic-title` TUI utilities for switching segment layouts (`segments`) and renaming sessions (`rename`).
- **Dual-Track Notifications**: Sends native OSC 9 notifications with an macOS fallback (`osascript`) if a task has completed or needs auth while focus is away.

### Changed
- **Direct Session Naming (Simplified)**: Removed automated LLM title generation, discarding `src/title-generator.ts` and all related external model requirements. The extension now displays `pi.getSessionName()` directly, avoiding third-party latency and credential dependencies.
- **Smart Fallback Logic**: Implemented guard rails to prevent duplication when both `worktree` and `title` segments are active; the `title` segment only displays session name if explicitly set, avoiding worktree title replication.
