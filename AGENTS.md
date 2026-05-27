## Project Structure

- **pi-dynamic-title**: A Pi Coding Agent Extension that dynamically updates terminal window titles with a composable four-segment format — status animation, agent name, model name, and intelligent session title.
- Work in a non-`main` git worktree for normal development.
- Only modify `main` directly when the user explicitly authorizes template or repository-structure maintenance.
- Manual worktrees live under `.worktrees/`.
- Worktree-local state (build output, temp files, datasets) lives under `.local/`.
- Shared specs live under `docs/specs/`.
- Agent notes, plans, archives, and project status live under `.agents/`.

## Tech Stack

- **Runtime**: Node.js / TypeScript (Pi Coding Agent Extension)
- **Build**: TypeScript compiler (`tsc`) — no bundler needed
- **Dependencies**: None required (uses only Pi built-in APIs)
- **Target**: Installed to `~/.pi/agent/extensions/pi-dynamic-title/`

## Directory Layout

```
├── AGENTS.md                 # This file — project structure guidance
├── .gitignore
├── .worktrees/               # Local worktrees (not tracked)
├── .local/                   # Worktree-local state (not tracked)
│   ├── data/
│   ├── dist/
│   ├── release/
│   ├── requirements/
│   └── target/
├── .agents/                  # Agent workspace
│   ├── notes/                # Research notes, session context
│   │   ├── AGENTS.md
│   │   └── archived/
│   └── plans/                # Implementation plans, project tracking
│       ├── AGENTS.md
│       ├── PROJECT_STATUS.md
│       └── archived/
├── docs/specs/               # Product and technical specs
│   └── README.md
├── src/                      # Extension source code
│   ├── index.ts              # Extension entry point
│   ├── config.ts             # Configuration parsing
│   ├── title-formatter.ts    # Title string formatting
│   └── title-generator.ts    # LLM title generation
├── package.json
└── tsconfig.json