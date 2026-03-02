# Sapling

Headless coding agent with proactive context management.

Sapling is a coding agent where context management is a first-class concern, not an afterthought. Between every LLM call, Sapling evaluates, prunes, and reshapes what the model sees — so it operates at maximum capacity for the entire task, not just the first 20 turns.

## Install

```bash
bun install -g @os-eco/sapling-cli
```

Requires [Bun](https://bun.sh) >= 1.0.

## Quick Start

```bash
# Run a task using Claude Code subscription billing
sp run "Add input validation to the login function in src/auth.ts"

# Use the Anthropic SDK backend (API billing)
sp run "Fix the failing test in src/utils.test.ts" --backend sdk

# Specify model and working directory
sp run "Refactor the auth module" --model claude-sonnet-4-6 --cwd /path/to/project

# Verbose mode (log context manager decisions)
sp run "Implement the caching layer" --verbose

# NDJSON event output
sp run "Add error handling" --json
```

## CLI Reference

```
sapling run <prompt>            Execute a task
  --model <name>                  Model to use (default: claude-sonnet-4-6)
  --cwd <path>                    Working directory (default: .)
  --backend <cc|sdk>              LLM backend (default: cc)
  --system-prompt-file <path>     Custom system prompt
  --max-turns <n>                 Max turns (default: 200)
  --verbose                       Log context manager decisions
  --json                          NDJSON event output on stdout
  --quiet, -q                     Suppress non-essential output

sapling version                 Print version
```

## How It Works

### The Problem

Existing coding agents (Claude Code, Pi, Codex) treat context management as an afterthought. They run until ~90% of the context window is full, then panic-compact. By that point, the model has been reading through increasingly bloated context for dozens of turns, degrading quality and wasting tokens.

### The Solution

Sapling manages context continuously, like garbage collection in a managed runtime. After every turn:

1. **Measure** — Count tokens per category. Are we over budget?
2. **Score** — Rate each message's relevance to the current subtask
3. **Prune** — Truncate large results, summarize old turns, drop stale reads
4. **Archive** — Move pruned content to a compact working memory
5. **Reshape** — Rebuild the message array: task + archive + recent turns

The LLM never sees a bloated context. Every piece of information has earned its place.

### Architecture

```
sapling/
  src/
    index.ts              CLI entry point
    loop.ts               Agent turn loop
    types.ts              Shared types and interfaces
    errors.ts             Custom error types
    config.ts             Config loader + validation
    client/               LLM backends (cc subprocess, Anthropic SDK)
    tools/                Tool implementations (bash, read, write, edit, grep, glob)
    context/              Context manager pipeline (measure, score, prune, archive, reshape)
    logging/              Structured logging
  agents/                 Agent definition files
```

### LLM Backends

| Backend | Billing | Method |
|---------|---------|--------|
| `cc` (default) | Claude Code subscription | `claude -p` subprocess |
| `sdk` | Anthropic API per-token | `@anthropic-ai/sdk` direct calls |

The CC subprocess backend uses Claude Code as a structured-output endpoint — Sapling owns the agent loop, tools, and context management. CC just handles auth and billing.

## Part of os-eco

Sapling is part of the [os-eco](https://github.com/jayminwest/os-eco) AI agent tooling ecosystem:

| Tool | Purpose |
|------|---------|
| [Mulch](https://github.com/jayminwest/mulch) | Structured expertise management |
| [Seeds](https://github.com/jayminwest/seeds) | Git-native issue tracking |
| [Canopy](https://github.com/jayminwest/canopy) | Prompt management & composition |
| [Overstory](https://github.com/jayminwest/overstory) | Multi-agent orchestration |
| **Sapling** | Headless coding agent |

## Development

```bash
git clone https://github.com/jayminwest/sapling.git
cd sapling
bun install
bun test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## License

[MIT](LICENSE)
