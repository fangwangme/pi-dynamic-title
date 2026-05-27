import type { DynamicTitleConfig } from "./config.js";

export type AgentStatus = "idle" | "running" | "needs_auth" | "error" | "success";

export interface TitleState {
  status: AgentStatus;
  agentName: string;
  modelName: string;
  worktreeName: string;
  sessionTitle: string;
  animationFrame?: string;
}

const SEPARATOR = " | ";

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
    case "needs_auth":
      return "!";
    case "error":
      return "✗";
    case "success":
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
        content = state.sessionTitle || (hasWorktreeSegment ? "" : state.worktreeName);
        break;
    }

    if (content) {
      parts.push(sanitizeTitle(content));
    }
  }

  // Fallback to title or agent name if all segments are empty
  return parts.length > 0
    ? parts.join(SEPARATOR)
    : sanitizeTitle(state.sessionTitle || state.worktreeName) || "π";
}

/** Extract short model name from full provider/model id string */
export function shortModelName(fullModelId: string): string {
  if (!fullModelId) return "";
  return fullModelId.split("/").pop() ?? fullModelId;
}
