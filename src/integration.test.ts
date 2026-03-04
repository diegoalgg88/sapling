/**
 * Integration tests for Sapling.
 *
 * These tests wire together the real tool system, real context manager,
 * and real Anthropic SDK backend to verify end-to-end agent behavior.
 * They run a real LLM (claude-haiku) against real temp directories.
 *
 * WHY GATED: Real API calls have real costs and require ANTHROPIC_API_KEY.
 * Set SAPLING_INTEGRATION_TESTS=1 to run.
 *
 * These tests would have caught every v0.1.x regression: CC/Pi tool-calling
 * failures, responseText bugs, and stdout output issues.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { runCommand } from "./cli.ts";
import { CcClient } from "./client/cc.ts";
import { validateConfig } from "./config.ts";
import { runLoop } from "./loop.ts";
import {
	cleanupTempDir,
	createMockClient,
	createTempDir,
	mockTextResponse,
	mockToolUseResponse,
} from "./test-helpers.ts";
import { createDefaultRegistry } from "./tools/index.ts";
import type { LoopOptions, RunOptions, SaplingConfig } from "./types.ts";

const SKIP = !process.env.SAPLING_INTEGRATION_TESTS;

describe.skipIf(SKIP)("integration tests (SDK backend, real API)", () => {
	let testDir: string;

	beforeEach(async () => {
		testDir = await createTempDir();
	});

	afterEach(async () => {
		await cleanupTempDir(testDir);
	});

	/** Build a SaplingConfig targeting the SDK backend with haiku for minimal cost. */
	function makeConfig(cwd: string): SaplingConfig {
		return validateConfig({
			backend: "sdk",
			model: "claude-haiku-4-5-20251001",
			maxTurns: 5,
			cwd,
			quiet: true,
		});
	}

	// -- Test 1: Agent reads a file and reports contents --

	it("reads a file and reports its contents", async () => {
		const filePath = join(testDir, "hello.txt");
		await Bun.write(filePath, "The secret code is ALPHA-7742");

		const config = makeConfig(testDir);
		const opts: RunOptions = { backend: "sdk", quiet: true };

		const result = await runCommand(
			`Read the file at ${filePath} and tell me what the secret code is. ` +
				"Include the exact code in your response.",
			opts,
			config,
		);

		expect(result.exitReason).toBe("task_complete");
		expect(result.responseText).toBeDefined();
		expect(result.responseText).toContain("ALPHA-7742");
	}, 60_000);

	// -- Test 2: Agent creates a file --

	it("creates a file with specified content", async () => {
		const filePath = join(testDir, "output.txt");
		const config = makeConfig(testDir);
		const opts: RunOptions = { backend: "sdk", quiet: true };

		const result = await runCommand(
			`Create a file at ${filePath} with exactly this content: Hello from Sapling`,
			opts,
			config,
		);

		expect(result.exitReason).toBe("task_complete");
		const file = Bun.file(filePath);
		expect(await file.exists()).toBe(true);
		const content = await file.text();
		expect(content).toContain("Hello from Sapling");
	}, 60_000);

	// -- Test 3: Agent runs bash and uses the output --

	it("runs a bash command and includes output in response", async () => {
		const config = makeConfig(testDir);
		const opts: RunOptions = { backend: "sdk", quiet: true };

		const result = await runCommand(
			'Run the command "echo SAPLING_MARKER_12345" and tell me exactly what it output.',
			opts,
			config,
		);

		expect(result.exitReason).toBe("task_complete");
		expect(result.responseText).toBeDefined();
		expect(result.responseText).toContain("SAPLING_MARKER_12345");
	}, 60_000);

	// -- Test 4: responseText appears in stdout via CLI --

	it("prints responseText to stdout when run via CLI", async () => {
		const filePath = join(testDir, "marker.txt");
		await Bun.write(filePath, "UNIQUE_MARKER_XYZ123");

		// Spawn sapling as a subprocess, same as a user would run it
		const proc = Bun.spawn(
			[
				"bun",
				join(import.meta.dir, "index.ts"),
				"run",
				`Read the file at ${filePath} and tell me its exact contents. Include the full text.`,
				"--backend",
				"sdk",
				"--model",
				"claude-haiku-4-5-20251001",
				"--max-turns",
				"5",
				"--quiet",
			],
			{
				cwd: testDir,
				stdout: "pipe",
				stderr: "pipe",
				env: { ...process.env },
			},
		);

		const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);

		expect(exitCode).toBe(0);
		// The agent final response should appear in stdout
		expect(stdout).toContain("UNIQUE_MARKER_XYZ123");
	}, 60_000);
});

// ─── Mock-client integration tests ───────────────────────────────────────────
//
// Middle tier between unit tests and real-API integration tests.
// Uses a scripted mock LLM client + real ToolRegistry (bash, read, write, etc.).
// No API key required. These catch bugs in tool dispatch, tool name routing,
// file I/O, and cwd handling that pure unit tests miss because they stub tools.
//
// NOT gated — these run with every `bun test` invocation.

describe("mock-client integration (real tools, scripted LLM)", () => {
	let testDir: string;

	beforeEach(async () => {
		testDir = await createTempDir();
	});

	afterEach(async () => {
		await cleanupTempDir(testDir);
	});

	/**
	 * Check whether a content block is a tool_result with the given text.
	 * Uses Record<string, unknown> cast because ContentBlock doesn't include tool_result
	 * (it's a user-turn input type in LoopMessage, not in the exported ContentBlock union).
	 */
	function isToolResult(b: unknown, textMatch?: string): boolean {
		if (typeof b !== "object" || b === null) return false;
		const block = b as Record<string, unknown>;
		if (block.type !== "tool_result") return false;
		if (textMatch === undefined) return true;
		return typeof block.content === "string" && block.content.includes(textMatch);
	}

	/** Minimal LoopOptions for mock-client tests. */
	function makeOpts(overrides: Partial<LoopOptions> = {}): LoopOptions {
		return {
			task: "test task",
			systemPrompt: "You are a test agent.",
			model: "mock-model",
			maxTurns: 5,
			cwd: testDir,
			...overrides,
		};
	}

	// -- Test 1: Real read tool dispatched via mock LLM --
	// Verifies the loop calls tools.dispatch("read", ...) and the result is
	// appended to messages. Catches bugs in tool name routing and result injection.

	it("dispatches real read tool and result appears in messages", async () => {
		const filePath = join(testDir, "data.txt");
		await Bun.write(filePath, "READ_CONTENT_MARKER");

		const client = createMockClient([
			mockToolUseResponse("read", { file_path: filePath }, "tool-1"),
			mockTextResponse("I read the file. It says READ_CONTENT_MARKER."),
		]);

		const tools = createDefaultRegistry();
		const result = await runLoop(client, tools, makeOpts());

		expect(result.exitReason).toBe("task_complete");
		expect(result.totalTurns).toBe(2);
		// The client should have received the tool result in a follow-up message
		expect(client.calls.length).toBe(2);
		const secondCall = client.calls[1];
		// Find the tool_result content block in messages
		const hasToolResult = secondCall?.messages.some(
			(m) =>
				Array.isArray(m.content) && m.content.some((b) => isToolResult(b, "READ_CONTENT_MARKER")),
		);
		expect(hasToolResult).toBe(true);
	});

	// -- Test 2: Real write tool creates a file on disk --
	// Verifies that tool dispatch actually executes the write tool's file I/O.
	// Catches the bug class where tool dispatch is wired but file writes silently fail.

	it("dispatches real write tool and file appears on disk", async () => {
		const filePath = join(testDir, "output.txt");

		const client = createMockClient([
			mockToolUseResponse("write", { file_path: filePath, content: "WRITE_MARKER_XYZ" }, "tool-2"),
			mockTextResponse("I wrote the file."),
		]);

		const tools = createDefaultRegistry();
		const result = await runLoop(client, tools, makeOpts());

		expect(result.exitReason).toBe("task_complete");
		const file = Bun.file(filePath);
		expect(await file.exists()).toBe(true);
		const content = await file.text();
		expect(content).toBe("WRITE_MARKER_XYZ");
	});

	// -- Test 3: Real bash tool executes with correct cwd --
	// Verifies that cwd propagation from LoopOptions reaches tool.execute().
	// Catches bugs where cwd is lost in the dispatch chain.

	it("dispatches real bash tool with correct cwd", async () => {
		const client = createMockClient([
			mockToolUseResponse("bash", { command: "pwd" }, "tool-3"),
			mockTextResponse("Done."),
		]);

		const tools = createDefaultRegistry();
		const result = await runLoop(client, tools, makeOpts());

		expect(result.exitReason).toBe("task_complete");
		// The bash result (pwd output) should appear in the second LLM call's messages
		const secondCall = client.calls[1];
		const hasCorrectCwd = secondCall?.messages.some(
			(m) => Array.isArray(m.content) && m.content.some((b) => isToolResult(b, testDir)),
		);
		expect(hasCorrectCwd).toBe(true);
	});

	// -- Test 4: Unknown tool name results in is_error tool_result --
	// Verifies the loop handles ToolError gracefully (unknown tool name from LLM).
	// The error result is injected back into messages; the loop does NOT crash.

	it("handles unknown tool name with error tool_result and continues", async () => {
		const client = createMockClient([
			mockToolUseResponse("nonexistent_tool", { arg: "value" }, "tool-4"),
			mockTextResponse("I see an error occurred."),
		]);

		const tools = createDefaultRegistry();
		const result = await runLoop(client, tools, makeOpts());

		expect(result.exitReason).toBe("task_complete");
		// Second LLM call should have an is_error tool_result
		const secondCall = client.calls[1];
		const hasErrorResult = secondCall?.messages.some(
			(m) =>
				Array.isArray(m.content) &&
				m.content.some(
					(b) =>
						typeof b === "object" &&
						b !== null &&
						(b as Record<string, unknown>).type === "tool_result" &&
						(b as Record<string, unknown>).is_error === true,
				),
		);
		expect(hasErrorResult).toBe(true);
	});

	// -- Test 5: responseText is captured from final LLM response --
	// Verifies LoopResult.responseText contains the final assistant text block.
	// This is the regression test for sapling-49eb (quiet flag / responseText bug).

	it("captures responseText from final assistant turn", async () => {
		const client = createMockClient([
			mockToolUseResponse("bash", { command: "echo hi" }, "tool-5"),
			mockTextResponse("The command output was: hi\n\nTask complete."),
		]);

		const tools = createDefaultRegistry();
		const result = await runLoop(client, tools, makeOpts());

		expect(result.exitReason).toBe("task_complete");
		expect(result.responseText).toBeDefined();
		expect(result.responseText).toContain("Task complete.");
	});

	// -- Test 6: Multi-turn tool sequence with real tools --
	// Verifies the loop correctly accumulates message history across multiple tool turns.
	// Write a file, then read it back — exercises two separate tool dispatches.

	it("executes multi-turn write-then-read tool sequence", async () => {
		const filePath = join(testDir, "round-trip.txt");

		const client = createMockClient([
			mockToolUseResponse("write", { file_path: filePath, content: "ROUND_TRIP_VALUE" }, "tool-6a"),
			mockToolUseResponse("read", { file_path: filePath }, "tool-6b"),
			mockTextResponse("I wrote then read the file. It contains ROUND_TRIP_VALUE."),
		]);

		const tools = createDefaultRegistry();
		const result = await runLoop(client, tools, makeOpts());

		expect(result.exitReason).toBe("task_complete");
		expect(result.totalTurns).toBe(3);

		// File should exist on disk
		expect(await Bun.file(filePath).exists()).toBe(true);
		// Third LLM call should have read result containing file content
		const thirdCall = client.calls[2];
		const hasReadResult = thirdCall?.messages.some(
			(m) => Array.isArray(m.content) && m.content.some((b) => isToolResult(b, "ROUND_TRIP_VALUE")),
		);
		expect(hasReadResult).toBe(true);
	});
});

// ─── CC backend smoke tests ───────────────────────────────────────────────────
//
// These tests expose the cc-plain-text-fallback bug: when the CC subprocess is
// called with --tools "" and --json-schema, the claude CLI ignores the schema
// and returns plain text instead of structured tool_calls. This means the CC
// backend is completely non-functional for tool-using tasks.
//
// WHY GATED: Requires a working `claude` CLI installation.
// Set SAPLING_INTEGRATION_TESTS=1 to run.

describe.skipIf(SKIP)("CC backend smoke tests (real claude subprocess)", () => {
	let testDir: string;
	let claudeAvailable = false;

	beforeAll(async () => {
		// Check if claude CLI is installed and responsive
		try {
			const proc = Bun.spawn(["claude", "--version"], {
				stdout: "pipe",
				stderr: "pipe",
			});
			const code = await proc.exited;
			claudeAvailable = code === 0;
		} catch {
			claudeAvailable = false;
		}
	});

	beforeEach(async () => {
		testDir = await createTempDir();
	});

	afterEach(async () => {
		await cleanupTempDir(testDir);
	});

	function makeCcConfig(cwd: string): SaplingConfig {
		return validateConfig({
			backend: "cc",
			model: "claude-haiku-4-5-20251001",
			maxTurns: 3,
			cwd,
			quiet: true,
		});
	}

	// -- Smoke Test 1: CC subprocess returns valid JSON for text prompt --
	// Verifies the CC subprocess can be invoked and returns parseable JSON.
	// No tools — this exercises the basic CC pipeline without --json-schema.

	it("CC subprocess returns structured JSON for text-only prompt", async () => {
		if (!claudeAvailable) {
			console.log("[SKIP] claude CLI not available, skipping CC smoke test");
			return;
		}

		const client = new CcClient({ model: "claude-haiku-4-5-20251001", timeoutMs: 30_000 });
		const result = await client.call({
			systemPrompt: "You are a concise assistant.",
			messages: [{ role: "user", content: "Reply with exactly: PONG" }],
			tools: [],
		});

		expect(result.stopReason).toBe("end_turn");
		expect(result.content.length).toBeGreaterThan(0);
		const text = result.content
			.filter(
				(b): b is Extract<(typeof result.content)[number], { type: "text" }> => b.type === "text",
			)
			.map((b) => b.text)
			.join("");
		expect(text.toUpperCase()).toContain("PONG");
	}, 30_000);

	// -- Smoke Test 2: CC subprocess with --json-schema documents tool_calls behavior --
	// This test exposes whether the CC backend actually returns tool_calls when requested.
	// Known issue: cc-plain-text-fallback — when --tools "" is combined with --json-schema,
	// the claude CLI may ignore the schema and return plain text (stopReason: "end_turn").
	// The test asserts stopReason IS "tool_use" — EXPECTED TO FAIL until the CC backend is fixed.

	it("CC subprocess with --json-schema returns tool_calls (validates tool dispatch)", async () => {
		if (!claudeAvailable) {
			console.log("[SKIP] claude CLI not available, skipping CC smoke test");
			return;
		}

		const client = new CcClient({ model: "claude-haiku-4-5-20251001", timeoutMs: 30_000 });
		const result = await client.call({
			systemPrompt:
				"You are a tool-using assistant. ALWAYS use tools when requested — never respond with text alone.",
			messages: [
				{
					role: "user",
					content: "Use the bash tool with command: echo SMOKE_MARKER_456",
				},
			],
			tools: [
				{
					name: "bash",
					description: "Run a bash command and return its output",
					input_schema: {
						type: "object",
						properties: { command: { type: "string" } },
						required: ["command"],
					},
				},
			],
		});

		// DIAGNOSTIC: log what the CC subprocess actually returned so failures are clear
		const toolBlocks = result.content.filter((b) => b.type === "tool_use");
		const textBlocks = result.content.filter((b) => b.type === "text");
		console.log(
			`[CC smoke] stopReason=${result.stopReason} tool_blocks=${toolBlocks.length} text_blocks=${textBlocks.length}`,
		);

		// This assertion documents the required behavior: CC backend MUST return tool_use.
		// If it fails, the cc-plain-text-fallback bug is active and CC is non-functional.
		expect(result.stopReason).toBe("tool_use");
		expect(toolBlocks.length).toBeGreaterThan(0);
		const toolBlock = toolBlocks[0];
		if (toolBlock?.type === "tool_use") {
			expect(toolBlock.name).toBe("bash");
		}
	}, 30_000);

	// -- Smoke Test 3: Full sp run with CC backend dispatches tools end-to-end --
	// Verifies that runCommand() with CC backend can actually read a file via tool dispatch.
	// This catches the bug where the agent loop never calls tools because CC returns plain text.

	it("sp run with CC backend dispatches read tool to access file contents", async () => {
		if (!claudeAvailable) {
			console.log("[SKIP] claude CLI not available, skipping CC smoke test");
			return;
		}

		const filePath = join(testDir, "secret.txt");
		await Bun.write(filePath, "CC_SECRET_TOKEN_789");

		const config = makeCcConfig(testDir);
		const opts: RunOptions = { backend: "cc", quiet: true };

		const result = await runCommand(
			`Read the file at ${filePath} and tell me the exact token value it contains.`,
			opts,
			config,
		);

		// If CC tool dispatch works, responseText must contain the token
		expect(result.exitReason).toBe("task_complete");
		expect(result.responseText).toBeDefined();
		expect(result.responseText).toContain("CC_SECRET_TOKEN_789");
	}, 60_000);
});
