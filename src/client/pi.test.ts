// WHY MOCK: Pi subprocess calls require a real pi CLI installation with real API costs.
// We mock Bun.spawn to return controlled output so we can test response parsing and error handling.

import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { generateExtensionContent, PiClient } from "./pi.ts";
import type { LlmRequest } from "./types.ts";

const baseRequest: LlmRequest = {
	systemPrompt: "You are a helpful assistant.",
	messages: [{ role: "user", content: "Hello" }],
	tools: [],
};

function makeFakeProcess(opts: { exitCode: number; stdout: string; stderr?: string }) {
	const encoder = new TextEncoder();
	const stdoutBytes = encoder.encode(opts.stdout);
	const stderrBytes = encoder.encode(opts.stderr ?? "");

	return {
		exited: Promise.resolve(opts.exitCode),
		kill: () => {},
		stdout: new ReadableStream({
			start(controller) {
				controller.enqueue(stdoutBytes);
				controller.close();
			},
		}),
		stderr: new ReadableStream({
			start(controller) {
				controller.enqueue(stderrBytes);
				controller.close();
			},
		}),
	};
}

// A process that never exits — simulates a hung subprocess for timeout tests.
function makeHangingProcess() {
	return {
		exited: new Promise<number>(() => {}),
		kill: () => {},
		stdout: new ReadableStream({
			start() {
				// Never close — simulates blocked output
			},
		}),
		stderr: new ReadableStream({
			start(controller) {
				controller.close();
			},
		}),
	};
}

function makeMessageEndOutput(opts?: {
	content?: unknown[];
	stop_reason?: string;
	usage?: unknown;
	model?: string;
}): string {
	return JSON.stringify({
		type: "message_end",
		message: {
			content: opts?.content ?? [{ type: "text", text: "Hello!" }],
			stop_reason: opts?.stop_reason ?? "stop",
			usage: opts?.usage ?? { input_tokens: 10, output_tokens: 5 },
			model: opts?.model ?? "pi-model-1",
		},
	});
}

function makeAgentEndOutput(text?: string): string {
	return JSON.stringify({
		type: "agent_end",
		text: text ?? "Task complete",
	});
}

describe("PiClient", () => {
	let spawnSpy: ReturnType<typeof spyOn>;

	beforeEach(() => {
		spawnSpy = spyOn(Bun, "spawn");
	});

	afterEach(() => {
		spawnSpy.mockRestore();
	});

	describe("estimateTokens", () => {
		const client = new PiClient();

		it("estimates tokens for short text", () => {
			expect(client.estimateTokens("hello")).toBe(2); // ceil(5/4) = 2
		});

		it("returns 0 for empty string", () => {
			expect(client.estimateTokens("")).toBe(0);
		});

		it("returns 1 for 4-char string", () => {
			expect(client.estimateTokens("abcd")).toBe(1);
		});
	});

	describe("id", () => {
		it("returns pi", () => {
			const client = new PiClient();
			expect(client.id).toBe("pi");
		});
	});

	describe("call", () => {
		it("parses message_end with tool calls", async () => {
			spawnSpy.mockReturnValue(
				makeFakeProcess({
					exitCode: 0,
					stdout: makeMessageEndOutput({
						content: [{ type: "tool_use", id: "tu-1", name: "bash", input: { command: "ls" } }],
						stop_reason: "toolUse",
					}),
				}),
			);

			const client = new PiClient();
			const result = await client.call({
				...baseRequest,
				tools: [{ name: "bash", description: "run bash", input_schema: {} }],
			});

			expect(result.stopReason).toBe("tool_use");
			const toolBlock = result.content.find((b) => b.type === "tool_use");
			expect(toolBlock).toBeDefined();
			if (toolBlock?.type === "tool_use") {
				expect(toolBlock.name).toBe("bash");
				expect(toolBlock.input).toEqual({ command: "ls" });
				expect(toolBlock.id).toBe("tu-1");
			}
		});

		it("throws PI_NO_RESPONSE when output is only agent_end (no message_end)", async () => {
			spawnSpy.mockReturnValue(
				makeFakeProcess({
					exitCode: 0,
					stdout: makeAgentEndOutput("Task complete"),
				}),
			);

			const client = new PiClient();
			await expect(client.call(baseRequest)).rejects.toMatchObject({
				code: "PI_NO_RESPONSE",
			});
		});

		it("parses message_end with mixed text and tool_use content", async () => {
			spawnSpy.mockReturnValue(
				makeFakeProcess({
					exitCode: 0,
					stdout: makeMessageEndOutput({
						content: [
							{ type: "text", text: "Running command..." },
							{ type: "tool_use", id: "tu-2", name: "read", input: { file_path: "/tmp/a.ts" } },
						],
						stop_reason: "toolUse",
					}),
				}),
			);

			const client = new PiClient();
			const result = await client.call({
				...baseRequest,
				tools: [{ name: "read", description: "read file", input_schema: {} }],
			});

			expect(result.stopReason).toBe("tool_use");
			expect(result.content).toHaveLength(2);
			const textBlock = result.content.find((b) => b.type === "text");
			expect(textBlock).toBeDefined();
			if (textBlock?.type === "text") {
				expect(textBlock.text).toBe("Running command...");
			}
			const toolBlock = result.content.find((b) => b.type === "tool_use");
			expect(toolBlock).toBeDefined();
			if (toolBlock?.type === "tool_use") {
				expect(toolBlock.name).toBe("read");
			}
		});

		it("maps usage tokens from message_end to LlmResponse", async () => {
			spawnSpy.mockReturnValue(
				makeFakeProcess({
					exitCode: 0,
					stdout: makeMessageEndOutput({
						usage: { input_tokens: 42, output_tokens: 17 },
					}),
				}),
			);

			const client = new PiClient();
			const result = await client.call(baseRequest);

			expect(result.usage.inputTokens).toBe(42);
			expect(result.usage.outputTokens).toBe(17);
		});

		it("maps stop reasons correctly: toolUse→tool_use, maxTokens→max_tokens, stop→end_turn", async () => {
			const cases: Array<{ piReason: string; expected: "tool_use" | "max_tokens" | "end_turn" }> = [
				{ piReason: "toolUse", expected: "tool_use" },
				{ piReason: "maxTokens", expected: "max_tokens" },
				{ piReason: "stop", expected: "end_turn" },
			];

			for (const { piReason, expected } of cases) {
				spawnSpy.mockReturnValue(
					makeFakeProcess({
						exitCode: 0,
						stdout: makeMessageEndOutput({
							content:
								piReason === "toolUse"
									? [{ type: "tool_use", id: "tu", name: "bash", input: {} }]
									: [{ type: "text", text: "done" }],
							stop_reason: piReason,
						}),
					}),
				);

				const client = new PiClient();
				const result = await client.call(baseRequest);
				expect(result.stopReason).toBe(expected);
			}
		});

		it("throws ClientError with PI_FAILED on non-zero exit code", async () => {
			spawnSpy.mockReturnValue(makeFakeProcess({ exitCode: 1, stdout: "", stderr: "fatal error" }));

			const client = new PiClient();
			await expect(client.call(baseRequest)).rejects.toMatchObject({
				code: "PI_FAILED",
			});
		});

		it("throws PI_FAILED on non-zero exit even when stdout has valid message_end", async () => {
			spawnSpy.mockReturnValue(
				makeFakeProcess({
					exitCode: 1,
					stdout: makeMessageEndOutput(),
					stderr: "something went wrong",
				}),
			);

			const client = new PiClient();
			await expect(client.call(baseRequest)).rejects.toMatchObject({
				code: "PI_FAILED",
			});
		});

		it("throws PI_NO_RESPONSE when no message_end event in output", async () => {
			spawnSpy.mockReturnValue(makeFakeProcess({ exitCode: 0, stdout: "" }));

			const client = new PiClient();
			await expect(client.call(baseRequest)).rejects.toMatchObject({
				code: "PI_NO_RESPONSE",
			});
		});

		it("throws PI_INVALID_OUTPUT when message_end has no usable content blocks", async () => {
			spawnSpy.mockReturnValue(
				makeFakeProcess({
					exitCode: 0,
					stdout: makeMessageEndOutput({
						content: [{ type: "unknown_block_type" }],
					}),
				}),
			);

			const client = new PiClient();
			await expect(client.call(baseRequest)).rejects.toMatchObject({
				code: "PI_INVALID_OUTPUT",
			});
		});

		it("prefers message_end over agent_end when both events present", async () => {
			const stdout = [
				makeAgentEndOutput("should be ignored"),
				makeMessageEndOutput({ content: [{ type: "text", text: "from message_end" }] }),
			].join("\n");

			spawnSpy.mockReturnValue(makeFakeProcess({ exitCode: 0, stdout }));

			const client = new PiClient();
			const result = await client.call(baseRequest);

			expect(result.stopReason).toBe("end_turn");
			const textBlock = result.content.find((b) => b.type === "text");
			expect(textBlock).toBeDefined();
			if (textBlock?.type === "text") {
				expect(textBlock.text).toBe("from message_end");
			}
		});

		it("parses multi-event JSONL and picks the message_end event", async () => {
			const events = [
				JSON.stringify({ type: "message_start", model: "pi-model-1" }),
				JSON.stringify({ type: "content_block_start", index: 0 }),
				JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "Hi" } }),
				makeMessageEndOutput({ content: [{ type: "text", text: "Final answer" }] }),
			].join("\n");

			spawnSpy.mockReturnValue(makeFakeProcess({ exitCode: 0, stdout: events }));

			const client = new PiClient();
			const result = await client.call(baseRequest);

			const textBlock = result.content.find((b) => b.type === "text");
			expect(textBlock).toBeDefined();
			if (textBlock?.type === "text") {
				expect(textBlock.text).toBe("Final answer");
			}
		});

		it("skips non-JSON lines in JSONL output", async () => {
			const stdout = [
				"not valid json",
				"",
				"   ",
				makeMessageEndOutput({ content: [{ type: "text", text: "valid response" }] }),
				"another bad line",
			].join("\n");

			spawnSpy.mockReturnValue(makeFakeProcess({ exitCode: 0, stdout }));

			const client = new PiClient();
			const result = await client.call(baseRequest);

			const textBlock = result.content.find((b) => b.type === "text");
			expect(textBlock).toBeDefined();
			if (textBlock?.type === "text") {
				expect(textBlock.text).toBe("valid response");
			}
		});

		it("serializes tool_result blocks in user messages correctly", async () => {
			spawnSpy.mockReturnValue(
				makeFakeProcess({
					exitCode: 0,
					stdout: makeMessageEndOutput(),
				}),
			);

			const client = new PiClient();
			const req: LlmRequest = {
				...baseRequest,
				messages: [
					{ role: "user", content: "Run bash" },
					{
						role: "assistant",
						content: [
							{
								type: "tool_use" as const,
								id: "tu-1",
								name: "bash",
								input: { command: "ls" },
							},
						],
					},
					{
						role: "user",
						content: [
							{
								type: "tool_result" as const,
								tool_use_id: "tu-1",
								content: "file1.ts\nfile2.ts",
							},
						] as never,
					},
				],
			};
			await client.call(req);

			const callArgs = spawnSpy.mock.calls[0];
			expect(callArgs).toBeDefined();
			const args = callArgs?.[0] as string[];
			// Last arg is the conversation (prompt)
			const conversation = args[args.length - 1];
			expect(conversation).toContain("file1.ts");
			expect(conversation).not.toContain("undefined");
		});

		it("verifies spawn args include -p, --mode json, --no-tools, --system-prompt", async () => {
			spawnSpy.mockReturnValue(
				makeFakeProcess({
					exitCode: 0,
					stdout: makeMessageEndOutput(),
				}),
			);

			const client = new PiClient();
			await client.call(baseRequest);

			const callArgs = spawnSpy.mock.calls[0];
			const args = callArgs?.[0] as string[];
			expect(args).toContain("-p");
			expect(args).toContain("--mode");
			expect(args).toContain("json");
			expect(args).toContain("--no-tools");
			expect(args).toContain("--system-prompt");
			expect(args).toContain(baseRequest.systemPrompt);
		});

		it("includes -e <extPath> in args when tools are provided", async () => {
			spawnSpy.mockReturnValue(
				makeFakeProcess({
					exitCode: 0,
					stdout: makeMessageEndOutput({
						content: [{ type: "tool_use", id: "t1", name: "bash", input: {} }],
						stop_reason: "toolUse",
					}),
				}),
			);

			const client = new PiClient();
			await client.call({
				...baseRequest,
				tools: [{ name: "bash", description: "run bash", input_schema: {} }],
			});

			const callArgs = spawnSpy.mock.calls[0];
			const args = callArgs?.[0] as string[];
			expect(args).toContain("-e");
			// The -e flag should be followed by a path containing "ext.ts"
			const extIndex = args.indexOf("-e");
			expect(args[extIndex + 1]).toContain("ext.ts");
		});

		it("normalizes tool names to lowercase", async () => {
			spawnSpy.mockReturnValue(
				makeFakeProcess({
					exitCode: 0,
					stdout: makeMessageEndOutput({
						content: [{ type: "tool_use", id: "tu", name: "Bash", input: { command: "echo hi" } }],
						stop_reason: "toolUse",
					}),
				}),
			);

			const client = new PiClient();
			const result = await client.call({
				...baseRequest,
				tools: [{ name: "bash", description: "run bash", input_schema: {} }],
			});

			const toolBlock = result.content.find((b) => b.type === "tool_use");
			expect(toolBlock).toBeDefined();
			if (toolBlock?.type === "tool_use") {
				expect(toolBlock.name).toBe("bash");
			}
		});

		it("uses zero for missing usage fields", async () => {
			spawnSpy.mockReturnValue(
				makeFakeProcess({
					exitCode: 0,
					stdout: makeMessageEndOutput({ usage: {} }),
				}),
			);

			const client = new PiClient();
			const result = await client.call(baseRequest);

			expect(result.usage.inputTokens).toBe(0);
			expect(result.usage.outputTokens).toBe(0);
		});
	});

	describe("timeout", () => {
		it("throws PI_TIMEOUT when subprocess hangs past timeoutMs", async () => {
			spawnSpy.mockReturnValue(makeHangingProcess());

			const client = new PiClient({ timeoutMs: 50 });
			await expect(client.call(baseRequest)).rejects.toMatchObject({
				code: "PI_TIMEOUT",
			});
		});

		it("does not timeout when subprocess responds before deadline", async () => {
			spawnSpy.mockReturnValue(
				makeFakeProcess({
					exitCode: 0,
					stdout: makeMessageEndOutput(),
				}),
			);

			const client = new PiClient({ timeoutMs: 5000 });
			const result = await client.call(baseRequest);
			expect(result.stopReason).toBe("end_turn");
		});

		it("uses 120_000ms default timeout when not configured", () => {
			const client = new PiClient();
			expect((client as unknown as { timeoutMs: number }).timeoutMs).toBe(120_000);
		});

		it("respects custom timeoutMs from config", () => {
			const client = new PiClient({ timeoutMs: 30_000 });
			expect((client as unknown as { timeoutMs: number }).timeoutMs).toBe(30_000);
		});
	});

	describe("generateExtensionContent", () => {
		it("generates TypeBox registerTool calls for each tool", () => {
			const tools = [
				{
					name: "bash",
					description: "Run a bash command",
					input_schema: { type: "object", properties: { command: { type: "string" } } },
				},
				{
					name: "read",
					description: "Read a file",
					input_schema: { type: "object", properties: { file_path: { type: "string" } } },
				},
			];

			const content = generateExtensionContent(tools);

			expect(content).toContain('import { registerTool, Type } from "pi"');
			expect(content).toContain('registerTool("bash"');
			expect(content).toContain('registerTool("read"');
			expect(content).toContain("Run a bash command");
			expect(content).toContain("Read a file");
		});

		it("escapes backslashes and double quotes in tool descriptions", () => {
			const tools = [
				{
					name: "write",
					description: 'Write "quoted" content with \\backslash',
					input_schema: {},
				},
			];

			const content = generateExtensionContent(tools);

			// Description must be safely embedded in a double-quoted JS string
			expect(content).toContain('\\"quoted\\"');
			expect(content).toContain("\\\\backslash");
		});
	});
});
