import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { cleanupTempDir, createTempDir } from "../test-helpers.ts";
import { BashTool } from "./bash.ts";

describe("BashTool", () => {
	let testDir: string;
	let tool: BashTool;
	const isWindows = process.platform === "win32";

	beforeEach(async () => {
		testDir = await createTempDir();
		tool = new BashTool();
	});

	afterEach(async () => {
		await cleanupTempDir(testDir);
	});

	it("executes a simple command and returns stdout", async () => {
		const result = await tool.execute({ command: "echo hello" }, testDir);
		expect(result.content).toContain("hello");
		expect(result.isError).toBeFalsy();
	});

	it("captures exit code 0 on success", async () => {
		const command = isWindows ? "exit 0" : "true";
		const result = await tool.execute({ command }, testDir);
		expect(result.content).toContain("Exit code: 0");
		expect(result.isError).toBeFalsy();
	});

	it("marks isError true on non-zero exit", async () => {
		const command = isWindows ? "exit 1" : "false";
		const result = await tool.execute({ command }, testDir);
		expect(result.isError).toBe(true);
		expect(result.content).toContain("Exit code: 1");
	});

	it("captures stderr", async () => {
		// In cmd, 1>&2 redirects stdout to stderr
		const command = isWindows ? "echo errout 1>&2" : "echo errout >&2";
		const result = await tool.execute({ command }, testDir);
		expect(result.content).toContain("errout");
	});

	it("uses cwd as working directory", async () => {
		const command = isWindows ? "cd" : "pwd";
		const result = await tool.execute({ command }, testDir);

		const realTestDir = resolve(testDir);
		const output = result.content.split("\n").pop()?.trim() ?? "";

		// Normalize paths for comparison
		const normalizedOutput = output.toLowerCase().replace(/\\/g, "/");
		const normalizedRealDir = realTestDir.toLowerCase().replace(/\\/g, "/");

		expect(normalizedOutput).toBe(normalizedRealDir);
	});

	it("returns metadata with tokensEstimate", async () => {
		const result = await tool.execute({ command: "echo x" }, testDir);
		expect(result.metadata?.tokensEstimate).toBeGreaterThan(0);
	});

	it("truncates output beyond limit", async () => {
		if (isWindows) return; // Skip complex quoting/buffer tests on Windows cmd
		const result = await tool.execute({ command: "python3 -c \"print('x' * 60000)\"" }, testDir);
		expect(result.content).toContain("[truncated]");
		expect(result.metadata?.truncated).toBe(true);
	});

	it("does not deadlock on output exceeding pipe buffer (~64KB)", async () => {
		if (isWindows) return; // Skip complex quoting/buffer tests on Windows cmd
		const result = await tool.execute({ command: "python3 -c \"print('x' * 200000)\"" }, testDir);
		expect(result.isError).toBeFalsy();
		expect(result.metadata?.truncated).toBe(true);
	});

	it("throws on empty command", async () => {
		expect(tool.execute({ command: "" }, testDir)).rejects.toThrow();
	});

	it("toDefinition returns correct structure", () => {
		const def = tool.toDefinition();
		expect(def.name).toBe("bash");
		expect(def.input_schema.required).toContain("command");
	});

	it("dry-run returns description without executing", async () => {
		tool.dryRun = true;
		const result = await tool.execute({ command: "rm -rf /" }, testDir);
		expect(result.isError).toBeFalsy();
		expect(result.content).toContain("[dry-run]");
		expect(result.content).toContain("rm -rf /");
	});

	it("dry-run default is false", () => {
		expect(new BashTool().dryRun).toBe(false);
	});
});
