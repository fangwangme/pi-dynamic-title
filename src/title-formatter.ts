import type { DynamicTitleConfig } from "./config.js";

export type AgentStatus = "idle" | "running" | "finished";

export interface TitleState {
  status: AgentStatus;
  agentName: string;
  modelName: string;
  worktreeName: string;
  sessionTitle: string;
  animationFrame?: string;
}



/**
 * Clean up title:
 * - Remove control characters
 * - Remove invisible / bidi characters
 * - Merge consecutive whitespaces
 * - Truncate to maxLength with fallback
 */
export function sanitizeTitle(raw: string, maxLength: number = 50): string {
  if (!raw) return "";
  let cleaned = raw
    .replace(/\s+/g, " ")                                       // Merge multiple spaces (including \n, \t) first
    .replace(/[\x00-\x1F\x7F]/g, "")                           // Then strip other control characters
    .replace(/[\u200B-\u200F\u2028-\u202E\u2060-\u206F]/g, "")  // Strip invisible/bidi characters
    .trim();

  if (cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength - 1) + "…";
  }

  return cleaned;
}

/** Get status representation content */
function getStatusContent(status: AgentStatus, frame?: string): string {
  switch (status) {
    case "idle":
      return "";
    case "running":
      return frame ?? "";
    case "finished":
      return "●";
  }
}

/** Formats terminal window title based on config and current state */
export function formatTitle(state: TitleState, config: DynamicTitleConfig): string {
  const parts: string[] = [];
  const hasWorktreeSegment = config.segments.includes("worktree");

  for (const segment of config.segments) {
    let content = "";

    switch (segment) {
      case "status":
        content = getStatusContent(state.status, state.animationFrame);
        break;
      case "agent":
        content = state.agentName;
        break;
      case "worktree":
        content = state.worktreeName;
        break;
      case "model":
        content = state.modelName;
        break;
      case "title":
        content = state.sessionTitle || "";
        break;
    }

    if (content) {
      parts.push(sanitizeTitle(content));
    }
  }

  const sep = config.separatorPadding
    ? ` ${config.separatorChar} `
    : config.separatorChar;

  // Fallback to title or agent name if all segments are empty
  return parts.length > 0
    ? parts.join(sep)
    : sanitizeTitle(state.sessionTitle || state.worktreeName) || "π";
}

/** Extract short model name from full provider/model id string and apply shortening rules */
export function shortModelName(fullModelId: string): string {
  if (!fullModelId) return "";
  let name = fullModelId.split("/").pop() ?? fullModelId;

  // Apply explicit abbreviations and clean-ups (case-insensitive)
  name = name.replace(/deepseek/gi, "DS");
  
  // Explicitly remove "claude" and its trailing/leading hyphen
  name = name.replace(/^claude-?/gi, "");
  name = name.replace(/-claude-?/gi, "-");
  
  // Explicitly remove "preview" and its trailing/leading hyphen
  name = name.replace(/-?preview$/gi, "");
  name = name.replace(/-?preview-?/gi, "-");

  return name.trim();
}

/**
 * Extract clean session name from an intercepted terminal title.
 * Strips common status icons and pi/π prefixes.
 */
export function cleanInterceptedTitle(title: string): string {
  if (!title) return "";
  let clean = title.trim();
  // Strip common status prefixes like "●", "✗", "!", spinner frames
  clean = clean.replace(/^[●✗\!⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s*/g, "");
  // Strip "π", "pi", "π -", "pi -", "π |", "pi |" at the beginning (case-insensitive)
  clean = clean.replace(/^(π|pi)\s*([\-\|·•−—–]\s*)?/i, "");
  return clean.trim();
}

