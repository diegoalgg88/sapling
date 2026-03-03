# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-03-02

Initial release of Sapling — a headless coding agent with proactive context management.

### Added

#### Core Agent Loop
- Turn-based agent loop (`src/loop.ts`) with LLM call → tool dispatch → context management cycle
- Parallel tool execution via `Promise.all` for all tool calls in a single turn
- Exponential backoff retry (3 attempts) for transient LLM failures
- Immediate abort on unrecoverable errors (auth failures, model not found)
- Three stop conditions: task complete (no tool calls), max turns (200), unrecoverable error
- NDJSON event streaming (`--json`) and quiet mode (`--quiet`) output options

#### Context Pipeline
- Five-stage inter-turn context manager (`src/context/manager.ts`):
  - **Measure** — token budget tracking with 4-chars/token heuristic and 5-zone window split (15% system, 10% archive, 40% history, 15% current, 20% headroom)
  - **Score** — relevance scoring (0–1) per message using weighted signals: recency (0.30), file overlap (0.25), error context (0.20), decision content (0.15), size penalty (0.10)
  - **Prune** — truncate large bash output, replace stale file reads, summarize/drop low-score old messages
  - **Archive** — rolling work summary from dropped messages (template-based, no LLM call), with file modification tracking and resolved error detection
  - **Reshape** — rebuild message array: [task] → [archive] → [pruned history] → [current turn]

#### Tool System
- Six tools implementing the `Tool` interface (`src/tools/`): `bash`, `read`, `write`, `edit`, `grep`, `glob`
- Tool registry with `createDefaultRegistry()` for registration and dispatch
- Tool result metadata (token estimates, file paths, truncation flags)
- Error-safe execution: tool failures return error results rather than crashing the loop

#### LLM Backends
- **CcClient** (`src/client/cc.ts`) — spawns `claude` subprocess with `--max-turns 1`, parses structured JSON responses; uses Claude Code subscription billing
- **AnthropicClient** (`src/client/anthropic.ts`) — direct Anthropic SDK calls; `@anthropic-ai/sdk` is an optional dependency, dynamically imported

#### CLI
- `sapling run <prompt>` command with options: `--model`, `--cwd`, `--backend`, `--system-prompt-file`, `--max-turns`, `--verbose`, `--json`, `--quiet`
- `sapling version` command
- Dual binary names: `sp` (short) and `sapling` (full)
- Configuration via env vars: `SAPLING_MODEL`, `SAPLING_BACKEND`, `SAPLING_MAX_TURNS`, `SAPLING_CONTEXT_WINDOW`
- Config validation with typed error hierarchy

#### Agent Personas
- Three system prompt personas emitted by Canopy (`agents/`):
  - **Builder** — writes code, runs quality gates, follows existing patterns
  - **Reviewer** — reviews code without making edits
  - **Scout** — explores codebases without making edits

#### Project Infrastructure
- CI workflow (GitHub Actions): test, lint, typecheck on push/PR
- Publish workflow: npm publish on version tags
- Biome linting (tabs, 100-char width, `noExplicitAny: error`)
- TypeScript strict mode (`tsc --noEmit`)
- Contributing guidelines, security policy, issue/PR templates
- Mulch expertise management, Seeds issue tracking, Canopy prompt management integration

#### Testing
- 164 tests across 17 files with 377 `expect()` calls
- Colocated test files (`src/foo.test.ts` next to `src/foo.ts`)
- Real temp directory helpers (`src/test-helpers.ts`)
- Full coverage of: agent loop, context pipeline (all 5 stages), both LLM clients, all 6 tools, config validation, error hierarchy

[Unreleased]: https://github.com/jayminwest/sapling/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/jayminwest/sapling/releases/tag/v0.1.0
