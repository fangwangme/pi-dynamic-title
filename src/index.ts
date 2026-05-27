import path from "node:path";
import { exec } from "node:child_process";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadConfig, setSegments, type DynamicTitleConfig } from "./config.js";
import {
  formatTitle,
  shortModelName,
  type AgentStatus,
  type TitleState,
} from "./title-formatter.js";

export default function (pi: ExtensionAPI) {
  // ===== Configuration =====
  const config = loadConfig();

  // ===== State =====
  let status: AgentStatus = "idle";
  let modelName = "";           // Short model name (e.g. "claude-sonnet-4")
  let worktreeName = "";        // Git worktree name or cwd basename fallback
  let needsAuth = false;
  let hadError = false;
  
  let successTimer: ReturnType<typeof setTimeout> | null = null;
  let notifTimer: ReturnType<typeof setTimeout> | null = null;
  let agentStartTime = 0;

  // ===== Animation control =====
  let animationTimer: ReturnType<typeof setInterval> | null = null;
  let frameIndex = 0;

  // ===== Input Subscription =====
  let inputUnsubscribe: (() => void) | null = null;

  function stopAnimation() {
    if (animationTimer) {
      clearInterval(animationTimer);
      animationTimer = null;
    }
    frameIndex = 0;
  }

  function startAnimation(ctx: ExtensionContext) {
    stopAnimation();
    animationTimer = setInterval(() => {
      const frame = config.spinnerFrames[frameIndex % config.spinnerFrames.length];
      const title = formatTitle(
        {
          status: "running",
          agentName: config.agentName,
          modelName,
          worktreeName,
          sessionTitle: pi.getSessionName() || "",
          animationFrame: frame,
        },
        config
      );
      if (ctx.hasUI) {
        ctx.ui.setTitle(title);
      }
      frameIndex++;
    }, config.animationInterval);
  }

  function updateTitle(ctx: ExtensionContext) {
    // If agent is currently running, the animation interval handles title updates.
    if (status === "running" && animationTimer) return;

    const title = formatTitle(
      {
        status,
        agentName: config.agentName,
        modelName,
        worktreeName,
        sessionTitle: pi.getSessionName() || "",
      },
      config
    );
    if (ctx.hasUI) {
      ctx.ui.setTitle(title);
    }
  }

  // ===== Success Status Fade-out =====
  function scheduleSuccessFade(ctx: ExtensionContext) {
    clearSuccessTimer();
    if (config.successDurationMs > 0) {
      successTimer = setTimeout(() => {
        if (status === "success") {
          status = "idle";
          updateTitle(ctx);
        }
        successTimer = null;
      }, config.successDurationMs);
    }
  }

  function clearSuccessTimer() {
    if (successTimer) {
      clearTimeout(successTimer);
      successTimer = null;
    }
  }

  // ===== Helpers =====
  function refreshModelName(ctx: ExtensionContext) {
    const model = ctx.model;
    modelName = model ? shortModelName(model.id) : "";
  }

  function getLastUserPrompt(ctx: ExtensionContext): string {
    const entries = ctx.sessionManager.getBranch();
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry.type === "message" && entry.message.role === "user") {
        const content = entry.message.content;
        if (typeof content === "string") return content;
        if (Array.isArray(content)) {
          const textPart = (content as any[]).find(
            (p: any) => p.type === "text" && !p.synthetic
          );
          if (textPart && "text" in textPart) return textPart.text;
        }
      }
    }
    return "";
  }

  function saveConfigToSession(ctx: ExtensionContext) {
    pi.appendEntry("dynamic-title-config", {
      segments: config.segments,
      agentName: config.agentName,
    });
  }

  function sendTerminalNotification(message: string, ctx: ExtensionContext) {
    if (notifTimer) {
      clearTimeout(notifTimer);
      notifTimer = null;
    }

    // 1. Send OSC 9 (native terminal notification)
    process.stdout.write(`\x1b]9;π ${message}\x07`);

    // 2. Fallback OS Notification (osascript on macOS) after 10 seconds if user hasn't focused
    if (process.platform === "darwin") {
      notifTimer = setTimeout(() => {
        notifTimer = null;
        exec(`osascript -e 'display notification "${message}" with title "π"'`);
      }, 10000);
    }
  }

  // Intercept confirm and select prompts globally to support Needs Auth state detection
  function ensureUiWrapped(ctx: ExtensionContext) {
    const ui = ctx.ui as any;
    if (!ui || ui.__wrapped) return;

    try {
      ui.__wrapped = true;
      const originalConfirm = ui.confirm;
      if (originalConfirm) {
        ui.confirm = async function (title: string, message: string, opts?: any) {
          const prevStatus = status;
          if (status === "running") {
            status = "needs_auth";
            needsAuth = true;
            updateTitle(ctx);
            if (config.notifications && config.notifyOnAuth) {
              sendTerminalNotification(`需要授权: ${message || title}`, ctx);
            }
          }
          try {
            return await originalConfirm.call(ui, title, message, opts);
          } finally {
            if (status === "needs_auth") {
              status = prevStatus;
              updateTitle(ctx);
            }
          }
        };
      }

      const originalSelect = ui.select;
      if (originalSelect) {
        ui.select = async function (title: string, options: string[], opts?: any) {
          // Exclude our own configuration menus from triggering auth/needs_auth state
          const isOwnMenu =
            title === "π Dynamic Title" ||
            title === "Title Segments" ||
            title === "Title Generation Model";
          const prevStatus = status;
          const shouldChangeStatus = status === "running" && !isOwnMenu;

          if (shouldChangeStatus) {
            status = "needs_auth";
            needsAuth = true;
            updateTitle(ctx);
            if (config.notifications && config.notifyOnAuth) {
              sendTerminalNotification(`需要确认选择: ${title}`, ctx);
            }
          }
          try {
            return await originalSelect.call(ui, title, options, opts);
          } finally {
            if (shouldChangeStatus && status === "needs_auth") {
              status = prevStatus;
              updateTitle(ctx);
            }
          }
        };
      }
    } catch (err) {
      console.error("[pi-dynamic-title] failed to wrap UI context methods:", err);
    }
  }

  // ===== Event Listeners =====

  // Session start -> Load base settings and check saved/active state overrides
  pi.on("session_start", async (_event, ctx) => {
    // Enable DECSET 1004 focus tracking
    process.stdout.write("\x1b[?1004h");

    // Load configs
    const baseConfig = loadConfig(ctx.cwd);
    Object.assign(config, baseConfig);

    // Apply config overrides saved in this session's history
    const entries = ctx.sessionManager.getBranch();
    const configEntry = entries.find(
      (e) => e.type === "custom" && (e as any).customType === "dynamic-title-config"
    );
    if (configEntry && (configEntry as any).data) {
      const savedConfig = (configEntry as any).data;
      if (Array.isArray(savedConfig.segments)) config.segments = savedConfig.segments;
      if (typeof savedConfig.agentName === "string") config.agentName = savedConfig.agentName;
    }

    status = "idle";
    needsAuth = false;
    hadError = false;
    refreshModelName(ctx);

    // Resolve default fallback name (Git repository/worktree root or CWD)
    let fallbackName = "";
    try {
      // Resolve the top-level directory of the Git worktree/repository
      const gitRoot = await new Promise<string>((resolve, reject) => {
        exec("git rev-parse --show-toplevel", { cwd: ctx.cwd || process.cwd() }, (err, stdout) => {
          if (err) reject(err);
          else resolve(stdout.trim());
        });
      });
      if (gitRoot) {
        fallbackName = path.basename(gitRoot);
      }
    } catch {
      // ignore git error, fallback to CWD
    }

    if (!fallbackName) {
      fallbackName = path.basename(ctx.cwd || process.cwd());
    }

    worktreeName = fallbackName || "π";

    // Wrap UI context immediately for interaction hooks
    ensureUiWrapped(ctx);

    // Setup raw terminal input listener for DECSET 1004 focus events
    if (inputUnsubscribe) {
      inputUnsubscribe();
      inputUnsubscribe = null;
    }

    inputUnsubscribe = ctx.ui.onTerminalInput((data: string) => {
      // \x1b[I -> Terminal Focus In
      if (data === "\x1b[I") {
        if (status === "success") {
          status = "idle";
          updateTitle(ctx);
        }
        if (notifTimer) {
          clearTimeout(notifTimer);
          notifTimer = null;
        }
        return { consume: true };
      }
      // \x1b[O -> Terminal Focus Out
      if (data === "\x1b[O") {
        return { consume: true };
      }
      return undefined;
    });

    updateTitle(ctx);
  });

  // Model changes -> Update segment dynamically
  pi.on("model_select", async (event, ctx) => {
    modelName = shortModelName(event.model.id);
    updateTitle(ctx);
  });

  // Before agent start -> Reset states
  pi.on("before_agent_start", async (event, ctx) => {
    needsAuth = false;
    hadError = false;
    clearSuccessTimer();
    ensureUiWrapped(ctx);

    updateTitle(ctx);
  });

  // Agent loop begins -> Set to running and spin
  pi.on("agent_start", async (_event, ctx) => {
    status = "running";
    agentStartTime = Date.now();
    ensureUiWrapped(ctx);
    startAnimation(ctx);
  });

  // Agent loop terminates -> Stop animation and notify if configured
  pi.on("agent_end", async (_event, ctx) => {
    stopAnimation();
    clearSuccessTimer();

    const duration = Date.now() - agentStartTime;
    const wasLongRunning = duration >= config.notifyMinDurationMs;

    if (needsAuth) {
      status = "needs_auth";
    } else if (hadError) {
      status = "error";
    } else {
      status = "success";
    }

    updateTitle(ctx);

    if (status === "needs_auth") {
      if (config.notifications && config.notifyOnAuth) {
        sendTerminalNotification("需要授权", ctx);
      }
    } else if (status === "success") {
      if (wasLongRunning && config.notifications && config.notifyOnComplete) {
        sendTerminalNotification("任务完成", ctx);
      }
      scheduleSuccessFade(ctx);
    }
  });

  // Tool execution results -> Track error occurrences
  pi.on("tool_result", async (event, _ctx) => {
    if (event.isError) {
      hadError = true;
    }
  });

  // Session shut down -> Clean up timers and unregister focus tracking
  pi.on("session_shutdown", async (_event, ctx) => {
    stopAnimation();
    clearSuccessTimer();
    if (notifTimer) {
      clearTimeout(notifTimer);
      notifTimer = null;
    }
    if (inputUnsubscribe) {
      inputUnsubscribe();
      inputUnsubscribe = null;
    }
    // Turn off DECSET 1004 Focus Tracking
    process.stdout.write("\x1b[?1004l");
  });

  // ===== Commands Registration =====
  pi.registerCommand("dynamic-title", {
    description: "Manage dynamic title: segments, rename",
    getArgumentCompletions: (prefix: string) => {
      const subcmds = ["segments", "rename"];
      const matches = subcmds.filter((s) => s.startsWith(prefix));
      return matches.length > 0 ? matches.map((s) => ({ value: s, label: s })) : null;
    },
    handler: async (args, ctx) => {
      ensureUiWrapped(ctx);
      const parts = args.trim().split(/\s+/);
      const subcmd = parts[0]?.toLowerCase();

      if (!subcmd) {
        // Main select menu
        const action = await ctx.ui.select("π Dynamic Title", [
          "Segments...",
          "Rename Session...",
          "Show Config",
        ]);
        if (!action) return;
        if (action === "Segments...") await handleSegments(ctx);
        else if (action === "Rename Session...") await handleRename(ctx);
        else if (action === "Show Config") showConfig(ctx);
        return;
      }

      if (subcmd === "segments") {
        await handleSegments(ctx);
      } else if (subcmd === "rename") {
        await handleRename(ctx);
      } else {
        ctx.ui.notify("Usage: /dynamic-title [segments|rename]", "info");
      }
    },
  });

  // Segments config menu
  async function handleSegments(ctx: ExtensionContext) {
    const presets = [
      {
        label: "status | agent | model | title  (default)",
        segments: ["status", "agent", "model", "title"],
      },
      {
        label: "status | agent | worktree | model | title  (all 5)",
        segments: ["status", "agent", "worktree", "model", "title"],
      },
      { label: "status | worktree | title", segments: ["status", "worktree", "title"] },
      { label: "status | worktree", segments: ["status", "worktree"] },
      { label: "status | title", segments: ["status", "title"] },
      { label: "Custom...", segments: null },
    ];

    const choice = await ctx.ui.select("Title Segments", presets.map((p) => p.label));
    if (!choice) return;

    if (choice === "Custom...") {
      const custom = await ctx.ui.input(
        "Enter segments (space-separated)",
        config.segments.join(" ")
      );
      if (custom) {
        const ok = setSegments(config, custom);
        if (ok) {
          updateTitle(ctx);
          saveConfigToSession(ctx);
          ctx.ui.notify(`Segments: ${config.segments.join(" ")}`, "info");
        } else {
          ctx.ui.notify("Invalid: at least one segment required", "error");
        }
      }
      return;
    }

    const preset = presets.find((p) => p.label === choice);
    if (preset && preset.segments) {
      config.segments = [...preset.segments] as any;
      updateTitle(ctx);
      saveConfigToSession(ctx);
      ctx.ui.notify(`Segments: ${config.segments.join(" ")}`, "info");
    }
  }

  // Interactive session renaming
  async function handleRename(ctx: ExtensionContext) {
    const currentName = pi.getSessionName() || worktreeName;
    const newName = await ctx.ui.input("Enter session name", currentName);
    if (newName !== undefined) {
      pi.setSessionName(newName);
      updateTitle(ctx);
      ctx.ui.notify(`Session renamed to: ${newName || "(default)"}`, "info");
    }
  }

  // Show config values
  function showConfig(ctx: ExtensionContext) {
    ctx.ui.notify(
      `Dynamic Title Config:\n` +
        `  segments: ${config.segments.join(" ")}\n` +
        `  agentName: ${config.agentName}\n` +
        `  animationInterval: ${config.animationInterval}ms\n` +
        `  successDuration: ${config.successDurationMs}ms`,
      "info"
    );
  }
}
