# Sapling — V1 Scope

## One-Liner
Headless coding agent with proactive context management — the production runtime for leaf agents (builders, scouts, reviewers) in overstory swarms, continuously optimizing the LLM's context window through an intelligent five-stage pipeline between every turn.

## V1 Definition of Done

### Core Agent
- [ ] `sp run <prompt>` executes a coding task end-to-end: LLM call, tool dispatch, context pipeline, repeat until done
- [ ] All 6 tools work correctly: bash, read, write, edit, grep, glob
- [ ] Grep tool resolves ripgrep binary reliably (currently 7 test failures related to rg resolution)
- [ ] Context pipeline v1 runs all 5 stages: ingest, evaluate, compact, budget, render
- [ ] Token budget allocation prevents context window overflow on long tasks
- [ ] Orphaned tool_use/tool_result pairs are never emitted to the LLM
- [ ] LLM client works with Anthropic SDK backend (model alias resolution, proper tool calling)
- [ ] Hooks/guards system enforces safety: blockedTools, readOnly, pathBoundary, fileScope, blockedBashPatterns
- [ ] Config cascade works: env vars > project YAML > home YAML > defaults
- [ ] Auth system works: `sp auth set/show/remove` manages API keys
- [ ] RPC mode works: `--mode rpc` accepts JSON-RPC commands on stdin (steer, followUp, abort)
- [ ] `--json` flag produces NDJSON event stream on stdout
- [ ] `--dry-run` shows what tools would do without executing
- [ ] Three agent personas load correctly: builder, reviewer, scout

### Overstory Runtime Integration
- [ ] Overstory sapling runtime adapter (`src/runtimes/sapling.ts`) spawns `sp run` correctly
- [ ] Leaf agents (builders, scouts, reviewers) complete tasks successfully when dispatched via `ov sling --runtime sapling`
- [ ] Guards file from overstory overlay is correctly passed through to sapling (`--guards-file`)
- [ ] Sapling respects worktree isolation (pathBoundary guard limits writes to worktree directory)
- [ ] Sapling respects file scope (fileScope guard limits writes to assigned files)
- [ ] NDJSON event output (`--json`) is consumable by overstory for logging/metrics
- [ ] Agent completes and exits cleanly (no zombie processes, no hung sessions)

### Quality Gates
- [ ] TypeScript compilation clean — fix the 3 `rpcSocket` type errors in `src/cli.ts`
- [ ] All tests pass (`bun test`) — fix the 7 grep tool test failures
- [ ] Linting passes (`bun run lint`)
- [ ] CI pipeline runs lint + typecheck + test on push/PR
- [ ] Published to npm as `@os-eco/sapling-cli`

## Explicitly Out of Scope for V1

- Full ecosystem integration into agent loop (open issue `sapling-c9d7` — mail checking, metrics writing, task status updates between turns). Basic overstory dispatch works; deep loop integration is post-V1
- Pipeline tuning via config cascade (open issue `sapling-9d47` — currently hardcoded constants)
- Async/LLM-based pipeline stages (open issue `sapling-a43b` — all stages are currently synchronous)
- Multiple LLM backends (only Anthropic SDK for V1; cc/pi backends are deprecated/removed)
- Streaming output (currently waits for full LLM response)
- Conversation persistence/resume across sessions
- Built-in test running or CI integration
- Web UI or visual debugger for context pipeline
- Custom tool registration (only the 6 built-in tools)
- Automatic model selection based on task complexity
- Cost tracking or budget enforcement

## Current State

Sapling is substantially built but has a few blockers before V1. The core agent loop, context pipeline, tool system, and CLI are all implemented. 792 tests pass, but 7 fail (all grep tool ripgrep resolution) and there are 3 TypeScript compilation errors (missing `rpcSocket` type on `RunOptions`).

The context pipeline v1 is the differentiating feature — 5-stage turn-level processing that keeps the model effective over long tasks. This is working but the tuning constants are hardcoded.

**What works:** Agent loop, 5/6 tools, context pipeline, LLM client, hooks, config, auth, RPC mode, CLI commands.
**What's broken:** Grep tool rg resolution in tests, 3 type errors in cli.ts.
**What's missing:** Ecosystem integration (mail, metrics, task status).

**Estimated completion: ~80%.** The 7 test failures and 3 type errors are concrete blockers. Beyond those, the overstory runtime integration (sapling as the leaf agent runtime) needs end-to-end validation — the adapter exists but hasn't been proven in a full swarm run with builders/scouts completing real tasks.

## Open Questions

- Is the grep tool's ripgrep dependency acceptable for V1, or should there be a pure-JS fallback for environments without `rg`?
- The default model is MiniMax-M2.5 — is this the intended V1 default, or should it be a Claude model?
- Pipeline tuning constants are hardcoded — is that acceptable for V1, or do they need to be configurable?
- What's the expected behavior when overstory dispatches a sapling agent that hits max turns (200) without completing? Should it signal failure via exit code, NDJSON event, or both?
