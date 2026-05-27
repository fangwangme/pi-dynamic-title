# Pi Dynamic Title Extension — 技术设计文档

> **目标**: 开发一个 Pi Coding Agent Extension，自动更新终端窗口标题（Terminal Title），实现四段式组合 title，方便多 Agent、多模型场景下快速定位。

---

## 1. Title 结构

### 1.1 四段式定义

```
[状态动画] | [Agent名称] | [模型名称] | [智能标题]
```

四段通过 ` | ` 分隔，每段之间有一个空格。用户可自由删减，**至少保留一段**。

### 1.2 各状态下的实际输出示例

假设四段全开（默认配置）：

| 状态 | Title |
|------|-------|
| 空闲 | `π \| claude-sonnet-4 \| 重构认证模块` |
| 运行中 | `⠋ π \| claude-sonnet-4 \| 重构认证模块` |
| 需要授权 | `! π \| claude-sonnet-4 \| 重构认证模块` |
| 报错 | `✗ π \| claude-sonnet-4 \| 重构认证模块` |
| 完成（5s后淡出） | `● π \| claude-sonnet-4 \| 重构认证模块` → `π \| claude-sonnet-4 \| 重构认证模块` |
| 标题未生成时 | `π \| claude-sonnet-4 \| my-project`（fallback 到 cwd basename） |

### 1.3 状态动画映射

| Agent 状态 | Title 前缀 | 类型 | 说明 |
|-----------|-----------|------|------|
| Idle | _(无)_ | — | 空闲时不显示任何符号 |
| Running | ⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏ | 动画 | Braille spinner，80ms 间隔循环 |
| Needs Auth | `!` | 静态 | 感叹号，需要用户授权 |
| Error | `✗` | 静态 | 叉号，执行报错 |
| Success | `●` | 静态 → 淡出 | 实心圆点，**5 秒后自动消失**回到 idle |

> 所有符号均为纯文字字符，不使用 emoji。Braille 字符和 ASCII 符号在各终端 title 中兼容性良好。

### 1.4 模型名称规则

模型名取 provider/model-id 层级分割后的**最后一段**：

```
anthropic/claude-sonnet-4     → claude-sonnet-4
deepseek/deepseek-chat        → deepseek-chat
google/gemini-2.5-flash       → gemini-2.5-flash
openai/gpt-4.1-mini           → gpt-4.1-mini
nvidia-nim/deepseek-ai/r1     → r1
```

实现：`modelId.split("/").pop()`

---

## 2. 可配置格式

### 2.1 设计思路

四段可自由删减，但**至少保留一段**。这个约束让用户可以根据自己的使用场景裁剪 title：

- **只用一个模型** → 去掉模型段，避免冗余
- **只用一个 Agent** → 去掉 Agent 名称段
- **不需要智能标题** → 去掉标题段，只看状态+模型
- **极简模式** → 只保留状态动画段

### 2.2 配置定义

```typescript
// 四段的标识符
type TitleSegment = "status" | "agent" | "model" | "title";

// 默认：四段全开
const DEFAULT_SEGMENTS: TitleSegment[] = ["status", "agent", "model", "title"];
```

### 2.3 配置方式

三种方式，各有用途：

**① settings.json（持久配置）：**

```json
{
  "dynamicTitle": {
    "segments": ["status", "agent", "model", "title"],
    "titleModel": "deepseek/deepseek-chat",
    "successDurationMs": 5000,
    "animationInterval": 80,
    "maxTitleLength": 50
  }
}
```

**② `/dynamic-title` 命令（交互式）：**

核心设计原则：**用 `ctx.ui.select()` 代替手动输入，避免拼写错误。**

```
/dynamic-title              → 弹出主菜单选择器
/dynamic-title segments     → 弹出段配置选择器
/dynamic-title model        → 弹出模型选择器（只列出可用模型）
/dynamic-title regenerate   → 重新生成标题
```

**③ 环境变量（脚本/CI 场景）：**

```bash
export PI_DYNAMIC_TITLE_SEGMENTS="status model title"
export PI_DYNAMIC_TITLE_MODEL=deepseek/deepseek-chat
```

### 2.3.1 交互式命令设计

Pi 提供的 UI API：
- `ctx.ui.select(title, options, { timeout? })` — 上下键选择，Enter 确认，Esc 取消
- `ctx.ui.confirm(title, message, { timeout? })` — 是/否确认
- `ctx.ui.input(title, placeholder)` — 文本输入
- `getArgumentCompletions(prefix)` — Tab 补全

**主菜单（`/dynamic-title`）：**

```typescript
const action = await ctx.ui.select("π Dynamic Title", [
  "Segments...",
  "Title Model...",
  "Regenerate Title",
  "Show Config",
]);
```

**段配置（`/dynamic-title segments`）：**

```typescript
// 用 select 选择预设模板
const choice = await ctx.ui.select("Title Segments", [
  "status | agent | model | title  (default)",
  "status | model | title",
  "status | title",
  "status | model",
  "status only",
  "Custom...",
]);

// 选择 Custom... 时弹 input
if (choice?.startsWith("Custom")) {
  const custom = await ctx.ui.input(
    "Enter segments (space-separated)",
    "status agent model title"
  );
  if (custom) {
    setSegments(config, custom);
    updateTitle(ctx);
  }
}
```

**模型选择（`/dynamic-title model`）：**

```typescript
// 从 getAvailable() 动态构建选项，用户不需要记住 model ID
const available = ctx.modelRegistry.getAvailable();
const options = [
  "(current model)",
  ...available.map(m => `${m.provider}/${m.id}  (${m.name})`),
];
const choice = await ctx.ui.select("Title Generation Model", options);

if (choice === "(current model)") {
  config.titleModel = undefined;
} else if (choice) {
  const [provider, ...idParts] = choice.split("  ")[0].split("/");
  config.titleModel = `${provider}/${idParts.join("/")}`;
}
```

> 优势：用户不需要记住 model ID，不需要手打，不会拼错。

**Tab 补全（`getArgumentCompletions`）：**

```typescript
pi.registerCommand("dynamic-title", {
  getArgumentCompletions: (prefix: string) => {
    const subcmds = ["segments", "model", "regenerate"];
    const matches = subcmds.filter(s => s.startsWith(prefix));
    return matches.length > 0
      ? matches.map(s => ({ value: s, label: s }))
      : null;
  },
  // ...
});
```

> Tab 补全用于快速操作（如 `/dynamic-title re` → Tab → `regenerate`），
> 而 select 用于需要从列表中选择的场景（如模型、段配置）。两者互补。

### 2.4 各段内容

| 段标识 | 内容 | 空闲时 | 运行时 | 需授权 | 报错 | 成功 |
|--------|------|--------|--------|--------|------|------|
| `status` | 状态动画/符号 | _(空，该段隐藏)_ | spinner帧 | `!` | `✗` | `●` |
| `agent` | Agent名称 | `π` | `π` | `π` | `π` | `π` |
| `model` | 模型短名 | `claude-sonnet-4` | `claude-sonnet-4` | `claude-sonnet-4` | `claude-sonnet-4` | `claude-sonnet-4` |
| `title` | 智能标题/cwd | `重构认证模块` | `重构认证模块` | `重构认证模块` | `重构认证模块` | `重构认证模块` |

> `status` 段在 idle 时为空，此时该段被跳过（不出现空的 `| |`）。

### 2.5 格式化规则

```
1. 收集所有启用段的内容
2. 过滤掉空内容段（如 idle 时的 status）
3. 用 " | " 连接所有非空段
4. 如果全部为空 → fallback 到 cwd basename
```

---

## 3. 架构设计

### 3.1 文件结构

```
~/.pi/agent/extensions/pi-dynamic-title/
├── index.ts              # Extension 入口：事件监听、动画控制、命令注册
├── title-generator.ts    # 智能标题 LLM 生成
├── title-formatter.ts    # Title 字符串格式化（段选择 + 分隔 + 状态映射）
└── config.ts             # 配置读取、默认值、校验
```

不需要 `package.json`——不依赖任何 npm 第三方包，全部使用 Pi 内置 API。

### 3.2 模块职责

| 模块 | 职责 |
|------|------|
| `config.ts` | 读取 settings.json / 环境变量，校验 `segments` 至少一段，提供默认值 |
| `title-formatter.ts` | 接收当前状态 + 段配置，输出最终 title 字符串 |
| `title-generator.ts` | 调用 LLM 生成 ≤50 字符的智能标题，处理超时/错误 |
| `index.ts` | 串联所有模块，管理动画定时器，注册事件和命令 |

### 3.3 事件驱动模型

```
用户发送 prompt
  │
  ├─► before_agent_start
  │     ├─ 重置 needsAuth/hadError 标志
  │     ├─ 前三段立即填入 title（动画段在 running 前为空）
  │     └─ 异步触发标题生成（若尚未生成）
  │           └─ 生成完成 → 更新 title 段 + pi.setSessionName()
  │
  ├─► agent_start → status = running → 启动 spinner 动画
  │
  │   ┌── turn 循环 ──────────────────┐
  │   │  ├─► turn_start               │
  │   │  ├─► tool_call (block检测)    │  → needsAuth = true
  │   │  ├─► tool_result (isError检测)│  → hadError = true
  │   │  └─► turn_end                 │
  │   └───────────────────────────────┘
  │
  ├─► agent_end
  │     ├─ 停止动画
  │     ├─ status = needsAuth ? "needs_auth" : hadError ? "error" : "success"
  │     ├─ 立即更新 title
  │     └─ 若 success → 5s 后 status = idle，再更新 title
  │
  ├─► model_select → 更新模型名段
  ├─► session_start → 恢复状态 + 从 getSessionName() 恢复标题
  └─► session_shutdown → 清理动画定时器
```

---

## 4. 详细设计

### 4.1 `config.ts`

```typescript
// config.ts

export type TitleSegment = "status" | "agent" | "model" | "title";

export interface DynamicTitleConfig {
  /** 启用的段，至少1段，默认四段全开 */
  segments: TitleSegment[];
  /** 用于生成标题的模型，格式 "provider/model-id"。必须是 modelRegistry.getAvailable() 中的模型。不配置则用当前工作模型 */
  titleModel?: string;
  /** Agent 显示名称，默认 "π" */
  agentName: string;
  /** 动画帧间隔(ms)，默认 80 */
  animationInterval: number;
  /** 生成标题的最大字符数，默认 50 */
  maxTitleLength: number;
  /** 是否启用标题生成，默认 true */
  titleGenerationEnabled: boolean;
  /** 成功状态 ● 的持续时间(ms)，默认 5000 (5秒) */
  successDurationMs: number;
  /** Spinner 帧序列 */
  spinnerFrames: string[];
}

const DEFAULT_SEGMENTS: TitleSegment[] = ["status", "agent", "model", "title"];

const DEFAULT_CONFIG: DynamicTitleConfig = {
  segments: [...DEFAULT_SEGMENTS],
  agentName: "π",
  animationInterval: 80,
  maxTitleLength: 50,
  titleGenerationEnabled: true,
  successDurationMs: 5000,
  spinnerFrames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
};

const VALID_SEGMENTS: Set<string> = new Set(["status", "agent", "model", "title"]);

/** 解析段配置字符串，如 "status agent model title" */
function parseSegments(input: string): TitleSegment[] {
  const parts = input.trim().split(/\s+/);
  const segments: TitleSegment[] = [];
  for (const p of parts) {
    if (VALID_SEGMENTS.has(p)) {
      segments.push(p as TitleSegment);
    }
  }
  return segments;
}

export function loadConfig(): DynamicTitleConfig {
  // 1. 环境变量覆盖
  const envModel = process.env.PI_DYNAMIC_TITLE_MODEL;
  const envSegments = process.env.PI_DYNAMIC_TITLE_SEGMENTS;

  const config = { ...DEFAULT_CONFIG };

  if (envModel) config.titleModel = envModel;
  if (envSegments) {
    const parsed = parseSegments(envSegments);
    if (parsed.length > 0) config.segments = parsed;
  }

  // 2. TODO: 从 settings.json 读取（需要确认 Pi 是否暴露 settings API）
  //    当前先用环境变量 + 运行时命令

  return config;
}

/** 运行时修改段配置，返回是否成功 */
export function setSegments(config: DynamicTitleConfig, input: string): boolean {
  if (input === "reset") {
    config.segments = [...DEFAULT_SEGMENTS];
    return true;
  }
  const parsed = parseSegments(input);
  if (parsed.length === 0) return false; // 至少保留一段
  config.segments = parsed;
  return true;
}
```

**配置方式：**

| 方式 | 示例 | 交互方式 |
|------|------|---------|
| settings.json | `"dynamicTitle": { "segments": ["status", "model", "title"] }` | 手写配置文件 |
| /dynamic-title | `/dynamic-title` → 弹出 select 选择器 | 交互式选择 |
| /dynamic-title segments | `/dynamic-title segments` → 弹出段配置选择器 | 交互式选择 |
| /dynamic-title model | `/dynamic-title model` → 弹出可用模型选择器 | 交互式选择 |
| 环境变量 | `PI_DYNAMIC_TITLE_SEGMENTS="status model title"` | 脚本/CI |

### 4.2 `title-formatter.ts`

```typescript
// title-formatter.ts

import type { DynamicTitleConfig, TitleSegment } from "./config";

export type AgentStatus = "idle" | "running" | "needs_auth" | "error" | "success";

export interface TitleState {
  status: AgentStatus;
  agentName: string;
  modelName: string;       // 已取最后一段，如 "claude-sonnet-4"
  sessionTitle: string;    // 智能生成的标题或 cwd basename
  animationFrame?: string; // running 时传入当前帧
}

const SEPARATOR = " | ";

/** 获取状态段的内容，idle 时返回空串（该段被跳过） */
function getStatusContent(status: AgentStatus, frame?: string): string {
  switch (status) {
    case "idle":
      return "";           // 空闲 → 该段不显示
    case "running":
      return frame ?? "";  // spinner 当前帧
    case "needs_auth":
      return "!";
    case "error":
      return "✗";
    case "success":
      return "●";
  }
}

/** 根据段配置 + 当前状态，格式化最终 title */
export function formatTitle(state: TitleState, config: DynamicTitleConfig): string {
  const parts: string[] = [];

  for (const segment of config.segments) {
    let content = "";

    switch (segment) {
      case "status":
        content = getStatusContent(state.status, state.animationFrame);
        break;
      case "agent":
        content = state.agentName;
        break;
      case "model":
        content = state.modelName;
        break;
      case "title":
        content = state.sessionTitle;
        break;
    }

    // 跳过空内容段（idle 时的 status）
    if (content) {
      parts.push(content);
    }
  }

  // 至少一段，但若全部为空则 fallback
  return parts.length > 0
    ? parts.join(SEPARATOR)
    : state.sessionTitle || "π";
}

/** 从完整 model id 提取短名称：取 / 分割最后一段 */
export function shortModelName(fullModelId: string): string {
  if (!fullModelId) return "";
  return fullModelId.split("/").pop() ?? fullModelId;
}
```

**格式化示例：**

| segments 配置 | 状态 | 输出 |
|---|---|---|
| `["status","agent","model","title"]` | idle | `π \| claude-sonnet-4 \| 重构认证模块` |
| `["status","agent","model","title"]` | running(⠋) | `⠋ \| π \| claude-sonnet-4 \| 重构认证模块` |
| `["status","agent","model","title"]` | needs_auth | `! \| π \| claude-sonnet-4 \| 重构认证模块` |
| `["status","agent","model","title"]` | error | `✗ \| π \| claude-sonnet-4 \| 重构认证模块` |
| `["status","agent","model","title"]` | success | `● \| π \| claude-sonnet-4 \| 重构认证模块` |
| `["status","model","title"]` | idle | `claude-sonnet-4 \| 重构认证模块` |
| `["status","model","title"]` | running(⠋) | `⠋ \| claude-sonnet-4 \| 重构认证模块` |
| `["status","model"]` | idle | `claude-sonnet-4` |
| `["status","model"]` | running(⠋) | `⠋ \| claude-sonnet-4` |
| `["status"]` | idle | _(fallback "π")_ |
| `["status"]` | running(⠋) | `⠋` |
| `["status"]` | success | `●` |

### 4.3 `title-generator.ts`

```typescript
// title-generator.ts

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { DynamicTitleConfig } from "./config";

/**
 * Title 生成 Prompt
 * 参考 Open Code title.txt 模板，输出 ≤50 字符单行标题
 */
const TITLE_SYSTEM_PROMPT = `You are a title generator. You output ONLY a thread title. Nothing else.

<task>
Generate a brief title that would help the user find this conversation later.
Follow all rules in <rules>.
Your output must be:
- A single line
- ≤50 characters
- No explanations
</task>

<rules>
- You MUST use the same language as the user message you are summarizing
- Title must be grammatically correct and read naturally - no word salad
- Never include tool names in the title (e.g. "read tool", "bash tool", "edit tool")
- Focus on the main topic or question the user needs to retrieve
- Vary your phrasing - avoid repetitive patterns like always starting with "Analyzing"
- When a file is mentioned, focus on WHAT the user wants to do WITH the file, not just that they shared it
- Keep exact: technical terms, numbers, filenames, HTTP codes
- Remove: the, this, my, a, an
- Never assume tech stack
- Never use tools
- NEVER respond to questions, just generate the title
</rules>

<examples>
- "Fix auth token refresh race"
- "Migrate postgres queries to pgpool"
- "HTTP 429 retry backoff"
- "React useEffect cleanup"
</examples>`;

/**
 * 使用 LLM 生成智能标题
 *
 * 模型选择优先级：
 *   1. 用户配置的 titleModel（便宜模型）
 *   2. 当前工作模型 (ctx.model)
 *   3. Fallback: 返回空串，使用 cwd
 *
 * 调用方式：裸 fetch 到 OpenAI-compatible endpoint
 * （因为 Pi 不暴露独立的 LLM 调用 API，这种方式最可靠）
 */
export async function generateTitle(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  userPrompt: string,
  config: DynamicTitleConfig
): Promise<string> {
  if (!config.titleGenerationEnabled || !userPrompt.trim()) {
    return "";
  }

  try {
    const model = resolveTitleModel(pi, ctx, config);
    if (!model) return "";

    const result = await callTitleModel(pi, ctx, model, userPrompt, config);
    return sanitizeTitle(result, config.maxTitleLength);
  } catch (err) {
    console.error("[pi-dynamic-title] title generation failed:", err);
    return "";
  }
}

/** 解析标题生成模型 — 必须是可用模型 */
function resolveTitleModel(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  config: DynamicTitleConfig
) {
  const available = ctx.modelRegistry.getAvailable();

  // 优先使用用户配置的专用模型（必须在可用列表中）
  if (config.titleModel) {
    const [providerId, ...modelIdParts] = config.titleModel.split("/");
    const modelId = modelIdParts.join("/");
    const model = ctx.modelRegistry.find(providerId, modelId);
    if (model && available.some(m => m.provider === model.provider && m.id === model.id)) {
      return model; // ✅ 在可用列表中
    }
    // ❌ 不可用，降级 + 警告
    console.warn(
      `[pi-dynamic-title] titleModel "${config.titleModel}" not available. ` +
      `Available: ${available.map(m => m.provider + "/" + m.id).join(", ")}`
    );
  }

  // 降级：使用当前工作模型
  return ctx.model ?? null;
}

/** 调用 OpenAI-compatible API 生成标题 */
async function callTitleModel(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  model: any,
  userPrompt: string,
  config: DynamicTitleConfig
): Promise<string> {
  // 通过 modelRegistry 获取 provider 的 baseUrl 和 apiKey env name
  // Pi 的 model 对象上通常有 provider 属性
  const provider = model.provider ?? "";
  const baseUrl = model.baseUrl ?? "";
  const apiKeyEnv = `${provider.toUpperCase()}_API_KEY`;
  const apiKey = process.env[apiKeyEnv] ?? "";

  if (!apiKey || !baseUrl) {
    throw new Error(`No API key or base URL for title model: ${model.id}`);
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model.id,
      messages: [
        { role: "system", content: TITLE_SYSTEM_PROMPT },
        {
          role: "user",
          content: `The following is the text to summarize:\n<text>\n${userPrompt}\n</text>`,
        },
      ],
      max_tokens: 60,
      temperature: 0.3,
    }),
    signal: ctx.signal ?? AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Title model API error: ${response.status}`);
  }

  const data = (await response.json()) as any;
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

/**
 * 清理标题（参考 Codex terminal_title.rs）
 * - 移除控制字符
 * - 移除不可见 / bidi 字符
 * - 合并空白
 * - 截断到 maxLength
 */
function sanitizeTitle(raw: string, maxLength: number): string {
  let cleaned = raw
    .replace(/[\x00-\x1F\x7F]/g, "")                           // 控制字符
    .replace(/[\u200B-\u200F\u2028-\u202E\u2060-\u206F]/g, "")  // 不可见/bidi
    .replace(/\s+/g, " ")                                        // 合并空白
    .trim();

  if (cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength - 1) + "…";
  }

  return cleaned;
}
```

### 4.4 `index.ts` — Extension 入口

```typescript
// index.ts

import path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadConfig, setSegments, type DynamicTitleConfig } from "./config";
import {
  formatTitle,
  shortModelName,
  type AgentStatus,
  type TitleState,
} from "./title-formatter";
import { generateTitle } from "./title-generator";

export default function (pi: ExtensionAPI) {
  // ===== 配置 =====
  const config = loadConfig();

  // ===== 状态 =====
  let status: AgentStatus = "idle";
  let modelName = "";           // 短名，如 "claude-sonnet-4"
  let sessionTitle = "";        // 智能标题 或 cwd
  let titleGenerated = false;
  let needsAuth = false;
  let hadError = false;
  let successTimer: ReturnType<typeof setTimeout> | null = null;

  // ===== 动画控制 =====
  let animationTimer: ReturnType<typeof setInterval> | null = null;
  let frameIndex = 0;

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
          sessionTitle,
          animationFrame: frame,
        },
        config
      );
      ctx.ui.setTitle(title);
      frameIndex++;
    }, config.animationInterval);
  }

  function updateTitle(ctx: ExtensionContext) {
    // running 状态由动画定时器负责更新
    if (status === "running" && animationTimer) return;

    const title = formatTitle(
      {
        status,
        agentName: config.agentName,
        modelName,
        sessionTitle,
      },
      config
    );
    ctx.ui.setTitle(title);
  }

  // ===== 成功状态淡出 =====
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

  // ===== 辅助 =====
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

  // ===== 事件监听 =====

  // 会话启动 → 初始化
  pi.on("session_start", async (_event, ctx) => {
    status = "idle";
    titleGenerated = false;
    needsAuth = false;
    hadError = false;
    refreshModelName(ctx);
    // 尝试从已保存的 session name 恢复
    sessionTitle = pi.getSessionName() || path.basename(process.cwd());
    updateTitle(ctx);
  });

  // 模型变更 → 立即更新模型段
  pi.on("model_select", async (event, ctx) => {
    modelName = shortModelName(event.model.id);
    updateTitle(ctx);
  });

  // Agent 开始前 → 重置状态 + 触发标题生成
  pi.on("before_agent_start", async (event, ctx) => {
    needsAuth = false;
    hadError = false;
    clearSuccessTimer();

    // 前三段立即填入（此时 status 还是 idle，title 中智能标题段先用 cwd）
    updateTitle(ctx);

    // 异步生成智能标题（不阻塞 Agent 开始）
    if (!titleGenerated && config.titleGenerationEnabled && event.prompt) {
      generateTitle(pi, ctx, event.prompt, config).then((title) => {
        if (title) {
          sessionTitle = title;
          pi.setSessionName(title); // 持久化，resume 时可恢复
          titleGenerated = true;
          updateTitle(ctx); // 异步完成后立即更新 title
        }
      });
    }
  });

  // Agent 开始 → 启动 spinner 动画
  pi.on("agent_start", async (_event, ctx) => {
    status = "running";
    startAnimation(ctx);
  });

  // Agent 结束 → 停止动画 + 设置终态
  pi.on("agent_end", async (_event, ctx) => {
    stopAnimation();
    clearSuccessTimer();

    if (needsAuth) {
      status = "needs_auth";
    } else if (hadError) {
      status = "error";
    } else {
      status = "success";
    }

    updateTitle(ctx);

    // 成功状态 N 秒后淡出
    if (status === "success") {
      scheduleSuccessFade(ctx);
    }
  });

  // 检测 tool 执行错误
  pi.on("tool_result", async (event, _ctx) => {
    if (event.isError) {
      hadError = true;
    }
  });

  // 会话关闭 → 清理
  pi.on("session_shutdown", async (_event, ctx) => {
    stopAnimation();
    clearSuccessTimer();
  });

  // ===== 命令注册 =====
pi.registerCommand("dynamic-title", {
  description: "Manage dynamic title: segments, model, regenerate",
  getArgumentCompletions: (prefix: string) => {
    const subcmds = ["segments", "model", "regenerate"];
    const matches = subcmds.filter(s => s.startsWith(prefix));
    return matches.length > 0
      ? matches.map(s => ({ value: s, label: s }))
      : null;
  },
  handler: async (args, ctx) => {
    const parts = args.trim().split(/\s+/);
    const subcmd = parts[0]?.toLowerCase();

    if (!subcmd) {
      // 无参数 → 弹出主菜单
      const action = await ctx.ui.select("π Dynamic Title", [
        "Segments...",
        "Title Model...",
        "Regenerate Title",
        "Show Config",
      ]);
      if (!action) return;
      if (action === "Segments...") await handleSegments(ctx);
      else if (action === "Title Model...") await handleModel(ctx);
      else if (action === "Regenerate Title") await handleRegenerate(ctx);
      else if (action === "Show Config") showConfig(ctx);
      return;
    }

    // 直接子命令（支持快捷操作）
    if (subcmd === "segments") {
      await handleSegments(ctx);
    } else if (subcmd === "model") {
      await handleModel(ctx);
    } else if (subcmd === "regenerate") {
      await handleRegenerate(ctx);
    } else {
      ctx.ui.notify("Usage: /dynamic-title [segments|model|regenerate]", "info");
    }
  },
});

// --- 段配置：交互式 select ---
async function handleSegments(ctx: ExtensionContext) {
  const presets = [
    { label: "status | agent | model | title  (default)", segments: ["status", "agent", "model", "title"] },
    { label: "status | model | title", segments: ["status", "model", "title"] },
    { label: "status | title", segments: ["status", "title"] },
    { label: "status | model", segments: ["status", "model"] },
    { label: "status only", segments: ["status"] },
    { label: "Custom...", segments: null },
  ];

  const choice = await ctx.ui.select("Title Segments", presets.map(p => p.label));
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
        ctx.ui.notify(`Segments: ${config.segments.join(" ")}`, "info");
      } else {
        ctx.ui.notify("Invalid: at least one segment required", "error");
      }
    }
    return;
  }

  const preset = presets.find(p => p.label === choice);
  if (preset?.segments) {
    config.segments = [...preset.segments];
    updateTitle(ctx);
    ctx.ui.notify(`Segments: ${config.segments.join(" ")}`, "info");
  }
}

// --- 模型选择：交互式 select + 可用模型校验 ---
async function handleModel(ctx: ExtensionContext) {
  const available = ctx.modelRegistry.getAvailable();
  const options = [
    "(current model)",
    ...available.map(m => `${m.provider}/${m.id}  (${m.name})`),
  ];

  const choice = await ctx.ui.select("Title Generation Model", options);
  if (!choice) return;

  if (choice === "(current model)") {
    config.titleModel = undefined;
    ctx.ui.notify("Title model: using current model", "info");
  } else {
    // "anthropic/claude-sonnet-4-20250514  (Claude Sonnet 4)" → "anthropic/claude-sonnet-4-20250514"
    const modelId = choice.split("  ")[0];
    config.titleModel = modelId;
    ctx.ui.notify(`Title model: ${modelId}`, "info");
  }
}

// --- 重新生成标题 ---
async function handleRegenerate(ctx: ExtensionContext) {
  titleGenerated = false;
  const prompt = getLastUserPrompt(ctx);
  if (prompt) {
    ctx.ui.notify("Generating title...", "info");
    const title = await generateTitle(pi, ctx, prompt, config);
    if (title) {
      sessionTitle = title;
      pi.setSessionName(title);
      titleGenerated = true;
      updateTitle(ctx);
      ctx.ui.notify(`Title: ${title}`, "info");
    } else {
      ctx.ui.notify("Title generation failed", "warning");
    }
  }
}

// --- 显示配置 ---
function showConfig(ctx: ExtensionContext) {
  ctx.ui.notify(
    `Dynamic Title Config:\n` +
    `  segments: ${config.segments.join(" ")}\n` +
    `  titleModel: ${config.titleModel ?? "(current model)"}\n` +
    `  agentName: ${config.agentName}\n` +
    `  animationInterval: ${config.animationInterval}ms\n` +
    `  successDuration: ${config.successDurationMs}ms\n` +
    `  titleGeneration: ${config.titleGenerationEnabled}\n` +
    `  maxTitleLength: ${config.maxTitleLength}`,
    "info"
  );
}
## 5. 标题生成模型策略

### 5.1 核心约束：只能用可用模型

**关键决策**：titleModel **必须是 Pi 已注册且已配置 auth 的可用模型**，不能随便填写。

原因：
- 写了一个不存在的 provider/model → 调用必然失败，白等超时
- 写了一个存在但没配 API key 的模型 → 同样失败
- 应该在配置时**校验**，而不是运行时才发现

Pi 提供的 API：
- `ctx.modelRegistry.getAvailable()` → 返回所有已配置 auth 的 `Model<Api>[]`
- `ctx.modelRegistry.find(provider, modelId)` → 查找特定模型
- Model 对象上有 `provider`（如 `"anthropic"`）、`id`（如 `"claude-sonnet-4-20250514"`）、`name`（如 `"Claude Sonnet 4"`）

### 5.2 模型选择优先级

```
1. 用户配置的 titleModel（可选，必须是 getAvailable() 中的模型）
2. 当前工作模型 (ctx.model)
3. Fallback: 不生成，使用 cwd basename
```

### 5.3 校验逻辑

```typescript
function resolveTitleModel(ctx: ExtensionContext, config: DynamicTitleConfig): Model | null {
  const available = ctx.modelRegistry.getAvailable();

  if (config.titleModel) {
    const [providerId, ...modelIdParts] = config.titleModel.split("/");
    const modelId = modelIdParts.join("/");
    const model = ctx.modelRegistry.find(providerId, modelId);
    if (model && available.some(m => m.provider === model.provider && m.id === model.id)) {
      return model; // ✅ 用户配的模型在可用列表中
    }
    // ❌ 不在可用列表，warn 并降级
    console.warn(
      `[pi-dynamic-title] titleModel "${config.titleModel}" is not available. ` +
      `Falling back to current model. Available: ${available.map(m => m.provider + "/" + m.id).join(", ")}`
    );
  }

  // 降级：使用当前工作模型
  if (ctx.model) {
    return ctx.model;
  }

  return null; // → fallback 到 cwd basename
}
```

### 5.4 `/dynamic-title model` 命令

模型选择已整合到交互式 select 中（详见 §2.3.1），核心逻辑：

1. `ctx.modelRegistry.getAvailable()` 获取所有可用模型
2. 动态构建选项列表，用户通过 `ctx.ui.select()` 选择
3. 选择的模型自动校验（因为列表本身就是可用模型，不可能选错）
4. 选择 "(current model)" 清除 titleModel 配置

> 对比旧方案：旧方案要求用户手打 `/dynamic-title model anthropic/claude-sonnet-4`，
> 容易拼错且不知道有哪些可用模型。新方案用 select 列出所有选项，
> 用户只需上下键选择，零出错。

### 5.5 推荐配置（供用户参考）

用户在 `/dynamic-title model` 看到完整列表后，可自行选择。常见的便宜选项：

| Provider/Model | 大致成本 | 延迟 | 说明 |
|---|---|---|---|
| `deepseek/deepseek-chat` | ~$0.14/M input | ~1-2s | 最便宜 |
| `google/gemini-2.5-flash` | ~$0.15/M input | ~1s | 均衡 |
| `openai/gpt-4.1-mini` | ~$0.40/M input | ~1s | 均衡 |
| `openai/o4-mini` | ~$1.10/M input | ~2s | 质量好 |

> 以上模型必须在 Pi 中配置了对应 API key 才可用，否则不会出现在可用列表中。

用户配置方式：

```bash
# 环境变量（启动时校验，不可用则降级 + console.warn）
export PI_DYNAMIC_TITLE_MODEL=deepseek/deepseek-chat

# 或运行时（交互式 select，不会选错）
/dynamic-title model

# 或 settings.json（启动时校验，不可用则降级 + console.warn）
{ "dynamicTitle": { "titleModel": "deepseek/deepseek-chat" } }
```

---

---

## 6. Focus Detection & Terminal Notification

### 6.1 Focus Detection — 成功状态 ● 何时消失

**需求**：任务完成后 ● 保留到用户切换到该 tab，而非固定超时。

**可行性**：✅ **技术上可行**

终端支持 **DECSET 1004 Focus Tracking**：
- 发送 `\x1b[?1004h` → 终端开始上报 focus 事件
- 窗口获得焦点 → 终端发送 `\x1b[I`
- 窗口失去焦点 → 终端发送 `\x1b[O`
- 主流终端支持率 **92%**（iTerm2、Ghostty、Warp、Kitty、VS Code、Terminal.app 等）

**Pi 的支持情况**：
- Pi 的 `StdinBuffer` 已能解析所有 CSI 序列（包括 `\x1b[I` / `\x1b[O`）
- Pi 暴露了 `ctx.ui.onTerminalInput(handler)` API，可以监听原始终端输入
- 但 Pi 当前 **没有启用** focus tracking mode（没有发送 `\x1b[?1004h`）

**实现方案**：

```typescript
// Extension 在 session_start 时启用 focus tracking
pi.on("session_start", async (_event, ctx) => {
  // 发送 DECSET 1004 启用 focus 上报
  process.stdout.write("\x1b[?1004h");

  // 监听 focus-in 事件
  const unsubscribe = ctx.ui.onTerminalInput((data: string) => {
    // \x1b[I = focus in (用户切换到该 tab/窗口)
    if (data === "\x1b[I" && status === "success") {
      status = "idle";
      updateTitle(ctx);
      return; // consume: 不传给 Pi 的 key handler
    }
  });

  // session_shutdown 时恢复
  pi.on("session_shutdown", async () => {
    process.stdout.write("\x1b[?1004l"); // 关闭 focus tracking
    unsubscribe();
  });
});
```

**降级策略**：
- 如果终端不支持 DECSET 1004 → 不会发送 `\x1b[I`，● 永远不消失 → **需要 fallback**
- Fallback：设置 `successDurationMs`（默认 30s），超时后自动淡出
- 两者共存：focus-in 时立即清除，否则 30s 后自动清除

```typescript
// agent_end 后：
if (status === "success") {
  // Focus-in 时会立即清除（如果终端支持）
  // 同时启动 30s fallback timer
  successTimer = setTimeout(() => {
    if (status === "success") {
      status = "idle";
      updateTitle(ctx);
    }
  }, 30000);
}

// onTerminalInput 收到 \x1b[I 时：
if (status === "success") {
  clearTimeout(successTimer);
  status = "idle";
  updateTitle(ctx);
}
```

> **结论**：优先检测 focus-in 来清除 ●，30s 超时作为 fallback。双保险。

### 6.2 Terminal Notification — 任务完成/需授权时发送系统通知

**需求**：Agent 需要授权或任务完成时，发送系统通知让用户知道。

**可行性**：✅ **部分可行**，取决于终端

**方案 A：OSC 9 — 原生终端通知**

```
\x1b]9;π 任务完成：重构认证模块\x07
\x1b]9;π 需要授权：rm -rf\x07
```

| 终端 | 支持 | 行为 |
|------|------|------|
| iTerm2 | ✅ | macOS 通知中心弹出 |
| Windows Terminal | ✅ | Windows Toast 通知 |
| Ghostty | ✅ | 系统通知 |
| Warp | ⚠️ | 部分支持 |
| Terminal.app | ❌ | 静默忽略 |
| VS Code Terminal | ❌ | 静默忽略 |

> 不支持的终端会静默忽略 OSC 9，**安全无害**，可以无条件发送。

**方案 B：macOS osascript — 通用 fallback**

```typescript
import { exec } from "node:child_process";

function sendMacNotification(title: string, message: string) {
  if (process.platform === "darwin") {
    exec(`osascript -e 'display notification "${message}" with title "${title}"'`);
  }
}
```

**推荐方案：OSC 9 优先 → 10s 延迟 fallback → osascript**

不要 OSC 9 + osascript 同时双发。而是：
1. 先发 OSC 9（原生终端通知）
2. 等 ~10s
3. 如果用户已经 focus 进来了（说明 OSC 9 生效了），就不需要 osascript
4. 如果 10s 后还没 focus，说明终端可能不支持 OSC 9，再发 osascript

这样 focus detection 和 notification 巧妙联动，避免重复通知。

```typescript
let notifTimer: ReturnType<typeof setTimeout> | null = null;

function sendTerminalNotification(message: string, ctx: ExtensionContext) {
  // Step 1: 先发 OSC 9（iTerm2/Ghostty/Windows Terminal 原生支持）
  process.stdout.write(`\x1b]9;π ${message}\x07`);

  // Step 2: 10s 后如果用户还没 focus 进来，发 osascript fallback
  notifTimer = setTimeout(() => {
    notifTimer = null;
    if (process.platform === "darwin") {
      exec(`osascript -e 'display notification "${message}" with title "π"'`);
    }
  }, 10000);
}

// focus-in 时取消 osascript fallback（说明 OSC 9 已生效，用户已看到通知）
ctx.ui.onTerminalInput((data: string) => {
  if (data === "\x1b[I") {
    if (notifTimer) {
      clearTimeout(notifTimer);
      notifTimer = null;
    }
    // ... 同时处理 ● 清除逻辑
  }
});

// 使用场景：
pi.on("agent_end", async (_event, ctx) => {
  // ...
  if (status === "needs_auth") {
    sendTerminalNotification("需要授权", ctx);
  } else if (status === "success" && wasLongRunning) {
    sendTerminalNotification("任务完成", ctx);
  }
});
```

> **注意**：需要避免短任务频繁通知（如 <5s 的任务），可通过计时判断是否为 "长任务"。

**可配置**：
```json
{
  "dynamicTitle": {
    "notifications": true,
    "notifyOnComplete": true,
    "notifyOnAuth": true,
    "notifyMinDurationMs": 5000
  }
}
```

---

## 7. 边界情况处理

| 场景 | 处理 |
|------|------|
| 标题生成 API 超时 | 10s 超时，fallback 到 cwd basename |
| 标题生成 API 报错 | catch 错误，不阻塞主流程 |
| 模型切换（/model） | 立即更新 title 中模型段 |
| 多轮对话 | 只在第一轮生成标题，后续保持 |
| Session resume | 从 `pi.getSessionName()` 恢复 |
| 非 TUI 模式（print/json） | `ctx.hasUI` 检查，skip `setTitle` |
| Ctrl+C 中断 | `session_shutdown` 清理定时器 |
| 段配置全部为空 | 校验拦截：`setSegments` 要求至少 1 段 |
| status 段 idle 时为空 | 自动跳过该段，不出现空 `| |` |
| 智能标题含特殊字符 | `sanitizeTitle` 清理控制字符、bidi、截断 |
| 同时运行多个 Pi Agent | 各自独立 title，通过模型名+标题区分 |

---

## 8. 性能考量

- **动画定时器**：80ms 间隔，每帧仅 `ctx.ui.setTitle()`（写 OSC 序列），开销极小
- **标题生成**：异步非阻塞，一次 LLM 调用 ~50 tokens，~1-2s
- **模型名获取**：`ctx.model` 同步读取 + `split("/").pop()`，零开销
- **内存**：少量状态变量 + 1 个 setInterval，< 1KB

---

## 9. 与 Open Code / Codex 的对比

| 特性 | Open Code | Codex CLI | 本 Extension |
|------|-----------|-----------|-------------|
| Title 生成 | 专用 "title" agent + 小模型 | 无（用户手动 /title 配置） | ✅ 可配便宜模型 / 降级到当前模型 |
| Title 组件 | N/A | 可排序的 `spinner,project,status,model` | ✅ 可配置四段，自由删减 |
| 分隔符 | N/A | 空格 | ` \| ` |
| 动画 | 无 title 动画 | spinner 帧在 title 中 | ✅ Braille spinner |
| 状态指示 | 无 | spinner / status text | ✅ idle / running / ! / ✗ / ● |
| 安全清理 | N/A | OSC 0 + 控制字符 + bidi + 截断 | ✅ sanitizeTitle |
| 持久化 | session.summary.title | N/A | ✅ pi.setSessionName() |
| 配置方式 | agent config | /title picker UI | env + settings.json + /命令 |
| 段可删减 | N/A | ✅ 可选排序 | ✅ 至少1段，自由组合 |

---

## 10. 开发步骤

| Phase | 内容 | 状态 |
|-------|------|------|
| 1 | 创建文件结构，实现 `config.ts` + `title-formatter.ts` | ⬜ |
| 2 | 实现 `index.ts` 核心事件监听 + 动画（不含标题生成） | ⬜ |
| 3 | 实现 `title-generator.ts` LLM 调用 | ⬜ |
| 4 | 集成测试：验证各状态/段配置下的 title 输出 | ⬜ |
| 5 | 添加 `/dynamic-title` 命令 | ⬜ |
| 6 | 打包为 git 仓库，通过 `pi install` 分发 | ⬜ |

---

## 11. 参考

- Pi Extension 文档: `/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md`
- Pi titlebar-spinner 示例: `examples/extensions/titlebar-spinner.ts`
- Pi model-status 示例: `examples/extensions/model-status.ts`
- Pi working-indicator 示例: `examples/extensions/working-indicator.ts`
- Pi session-name 示例: `examples/extensions/session-name.ts`
- Open Code title prompt: `https://github.com/sst/opencode/blob/c7b35342/packages/opencode/src/agent/prompt/title.txt`
- Open Code summary 实现: `https://github.com/sst/opencode/blob/4086a9ae/packages/opencode/src/session/summary.ts`
- Codex terminal_title.rs: `https://github.com/openai/codex/blob/main/codex-rs/tui/src/terminal_title.rs`
- Codex /title PR: `https://github.com/openai/codex/pull/12334`
