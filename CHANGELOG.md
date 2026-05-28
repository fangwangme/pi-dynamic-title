# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-05-28

### Added
- **Explicit Model Name Mapping**: Trims model names to save screen space, abbreviating `deepseek` to `DS`, and explicitly removing `claude` and `preview` along with adjacent hyphens (preserving version hyphens such as `1-5` or `2.0`).
- **Customizable Separator**: Supports separator character configuration (defaulting to mid dot ` · `) with optional padding spacing.

### Changed
- **Simplified Status States**: Reduced visual status indicators to two active states: `running` (Braille spinner animation) and `finished` (completion dot `●` that disappears upon terminal window refocusing or falls back to a 5-second automatic timeout).
- **Title-Only Scope**: Removed terminal and system completion notifications so the extension only manages terminal titles.
- **Cleanup and Optimization**: Removed all dead code (such as confirm/select dialog wrappers, user prompt traversals, and deprecated settings/notifications like `notifyOnAuth`).
- **Robust Focus Detection**: Transitioned to dynamic focus detection that activates support on the first received terminal escape sequence rather than relying on a startup timer.
- **Documentation & Localization**: Cleaned up codebase and updated technical design, release guides, and README files to be 100% in English and fully consistent with the new design.

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

### Fixed
- **Title Overriding Protection**: Dynamically wrapped and intercepted `ctx.ui.setTitle` calls from the core agent and other extensions, ensuring that asynchronously generated session titles or resets are successfully formatted into our 5-segment schema instead of completely overriding it.
