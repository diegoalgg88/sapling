import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { readAuthStore } from "./auth.ts";

const AUTH_DIR = join(homedir(), ".sapling");
const AUTH_FILE = join(AUTH_DIR, "auth.json");

const CLI = join(import.meta.dir, "..", "index.ts");

async function runCli(
	args: string[],
	env?: Record<string, string>,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	const proc = Bun.spawn(["bun", "run", CLI, ...args], {
		stdout: "pipe",
		stderr: "pipe",
		env: { ...process.env, ...env },
	});
	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();
	const exitCode = await proc.exited;
	return { stdout, stderr, exitCode };
}

// Backup/restore auth file around tests
let backupContent: string | null = null;

beforeEach(async () => {
	if (existsSync(AUTH_FILE)) {
		backupContent = await readFile(AUTH_FILE, "utf-8");
	} else {
		backupContent = null;
	}
	// Start with a clean state
	if (existsSync(AUTH_FILE)) {
		rmSync(AUTH_FILE);
	}
});

afterEach(async () => {
	// Restore original file
	if (existsSync(AUTH_FILE)) {
		rmSync(AUTH_FILE);
	}
	if (backupContent !== null) {
		await Bun.write(AUTH_FILE, backupContent);
	}
});

describe("auth set", () => {
	test("stores anthropic key and writes 0600 file", async () => {
		const { exitCode, stderr } = await runCli([
			"auth",
			"set",
			"anthropic",
			"--key",
			"sk-ant-test123",
		]);
		expect(stderr).toBe("");
		expect(exitCode).toBe(0);

		const store = await readAuthStore();
		expect(store.providers.anthropic?.apiKey).toBe("sk-ant-test123");

		// Check file permissions
		const stat = Bun.file(AUTH_FILE);
		expect(stat).toBeDefined();
	}, 15000);

	test("stores minimax key with base URL", async () => {
		const { exitCode } = await runCli([
			"auth",
			"set",
			"minimax",
			"--key",
			"sk-mm-test456",
			"--base-url",
			"https://api.minimax.io/anthropic",
		]);
		expect(exitCode).toBe(0);

		const store = await readAuthStore();
		expect(store.providers.minimax?.apiKey).toBe("sk-mm-test456");
		expect(store.providers.minimax?.baseUrl).toBe("https://api.minimax.io/anthropic");
	}, 15000);

	test("rejects unknown provider", async () => {
		const { exitCode, stderr } = await runCli(["auth", "set", "openai", "--key", "sk-x"]);
		expect(exitCode).toBe(1);
		expect(stderr).toContain("Unknown provider");
	}, 15000);

	test("errors without --key", async () => {
		const { exitCode, stderr } = await runCli(["auth", "set", "anthropic"]);
		expect(exitCode).toBe(1);
		expect(stderr).toContain("--key");
	}, 15000);

	test("--json output on success", async () => {
		const { stdout, exitCode } = await runCli([
			"auth",
			"set",
			"anthropic",
			"--key",
			"sk-ant-test123",
			"--json",
		]);
		expect(exitCode).toBe(0);
		const data = JSON.parse(stdout) as Record<string, unknown>;
		expect(data.success).toBe(true);
		expect(data.provider).toBe("anthropic");
	}, 15000);

	test("stores nvidia key", async () => {
		const { exitCode } = await runCli([
			"auth",
			"set",
			"nvidia",
			"--key",
			"nvapi-test123",
		]);
		expect(exitCode).toBe(0);

		const store = await readAuthStore();
		expect(store.providers.nvidia?.apiKey).toBe("nvapi-test123");
	}, 15000);

	test("stores qwen key", async () => {
		const { exitCode } = await runCli([
			"auth",
			"set",
			"qwen",
			"--key",
			"sk-qwen-test456",
		]);
		expect(exitCode).toBe(0);

		const store = await readAuthStore();
		expect(store.providers.qwen?.apiKey).toBe("sk-qwen-test456");
	}, 15000);
});

describe("auth status", () => {
	test("shows not configured when no key set", async () => {
		const { stdout, exitCode } = await runCli(["auth", "status"], {
			ANTHROPIC_API_KEY: "",
		});
		expect(exitCode).toBe(0);
		expect(stdout).toContain("Auth Status");
	}, 15000);

	test("--json returns structured output", async () => {
		const { stdout, exitCode } = await runCli(["auth", "status", "--json"], {
			ANTHROPIC_API_KEY: "",
		});
		expect(exitCode).toBe(0);
		const data = JSON.parse(stdout) as Record<string, unknown>;
		expect(data.success).toBe(true);
		expect(Array.isArray(data.providers)).toBe(true);
		const providers = data.providers as Array<{ provider: string; configured: boolean }>;
		const names = providers.map((p) => p.provider);
		expect(names).toContain("anthropic");
		expect(names).toContain("minimax");
		expect(names).toContain("nvidia");
		expect(names).toContain("qwen");
		expect(names).toContain("gemini");
	}, 15000);

	test("shows configured key masked from file", async () => {
		await runCli(["auth", "set", "anthropic", "--key", "sk-ant-abcdefghij"]);
		const { stdout } = await runCli(["auth", "status", "--json"], {
			ANTHROPIC_API_KEY: "",
		});
		const data = JSON.parse(stdout) as {
			providers: Array<{
				provider: string;
				configured: boolean;
				source: string;
				maskedKey?: string;
			}>;
		};
		const ant = data.providers.find((p) => p.provider === "anthropic");
		expect(ant?.configured).toBe(true);
		expect(ant?.source).toBe("file");
		expect(ant?.maskedKey).toContain("...");
	}, 15000);

	test("env var takes precedence over file", async () => {
		await runCli(["auth", "set", "anthropic", "--key", "sk-ant-fromfile"]);
		const { stdout } = await runCli(["auth", "status", "--json"], {
			ANTHROPIC_API_KEY: "sk-ant-fromenv",
		});
		const data = JSON.parse(stdout) as { providers: Array<{ provider: string; source: string }> };
		const ant = data.providers.find((p) => p.provider === "anthropic");
		expect(ant?.source).toBe("env");
	}, 15000);

	test("shows nvidia key from env var", async () => {
		const { stdout } = await runCli(["auth", "status", "--json"], {
			NVIDIA_API_KEY: "nvapi-fromenv",
		});
		const data = JSON.parse(stdout) as { providers: Array<{ provider: string; source: string; maskedKey?: string }> };
		const nvidia = data.providers.find((p) => p.provider === "nvidia");
		expect(nvidia?.source).toBe("env");
		expect(nvidia?.maskedKey).toContain("nvap");
	}, 15000);

	test("shows qwen key from env var (Z_AI_API_KEY)", async () => {
		const { stdout } = await runCli(["auth", "status", "--json"], {
			Z_AI_API_KEY: "sk-qwen-fromenv",
		});
		const data = JSON.parse(stdout) as { providers: Array<{ provider: string; source: string; maskedKey?: string }> };
		const qwen = data.providers.find((p) => p.provider === "qwen");
		expect(qwen?.source).toBe("env");
		expect(qwen?.maskedKey).toContain("sk-q");
	}, 15000);
});

describe("auth clear", () => {
	test("clears specific provider", async () => {
		await runCli(["auth", "set", "anthropic", "--key", "sk-ant-test"]);
		const { exitCode } = await runCli(["auth", "clear", "anthropic"]);
		expect(exitCode).toBe(0);

		const store = await readAuthStore();
		expect(store.providers.anthropic).toBeUndefined();
	}, 15000);

	test("clears all when no provider given", async () => {
		await runCli(["auth", "set", "anthropic", "--key", "sk-ant-test"]);
		await runCli(["auth", "set", "minimax", "--key", "sk-mm-test"]);
		const { exitCode } = await runCli(["auth", "clear"]);
		expect(exitCode).toBe(0);

		const store = await readAuthStore();
		expect(Object.keys(store.providers)).toHaveLength(0);
	}, 15000);

	test("--json output on clear", async () => {
		await runCli(["auth", "set", "anthropic", "--key", "sk-ant-test"]);
		const { stdout, exitCode } = await runCli(["auth", "clear", "anthropic", "--json"]);
		expect(exitCode).toBe(0);
		const data = JSON.parse(stdout) as Record<string, unknown>;
		expect(data.success).toBe(true);
		expect(data.cleared).toBe(true);
	}, 15000);

	test("rejects unknown provider", async () => {
		const { exitCode, stderr } = await runCli(["auth", "clear", "openai"]);
		expect(exitCode).toBe(1);
		expect(stderr).toContain("Unknown provider");
	}, 15000);

	test("clears nvidia provider", async () => {
		await runCli(["auth", "set", "nvidia", "--key", "nvapi-test"]);
		const { exitCode } = await runCli(["auth", "clear", "nvidia"]);
		expect(exitCode).toBe(0);

		const store = await readAuthStore();
		expect(store.providers.nvidia).toBeUndefined();
	}, 15000);

	test("clears qwen provider", async () => {
		await runCli(["auth", "set", "qwen", "--key", "sk-qwen-test"]);
		const { exitCode } = await runCli(["auth", "clear", "qwen"]);
		expect(exitCode).toBe(0);

		const store = await readAuthStore();
		expect(store.providers.qwen).toBeUndefined();
	}, 15000);

	test("stores gemini key", async () => {
		await runCli([
			"auth",
			"set",
			"gemini",
			"--key",
			"ya29.gemini-test-token",
		]);

		const store = await readAuthStore();
		expect(store.providers.gemini?.apiKey).toBe("ya29.gemini-test-token");
	}, 15000);

	test("shows gemini key from env var", async () => {
		const { stdout, exitCode } = await runCli(["auth", "status", "--json"], {
			GEMINI_API_KEY: "ya29-fromenv",
		});
		expect(exitCode).toBe(0);
		const data = JSON.parse(stdout) as {
			providers: Array<{
				provider: string;
				source: string;
				maskedKey?: string;
			}>;
		};
		const gemini = data.providers.find((p: { provider: string }) => p.provider === "gemini");
		expect(gemini?.source).toBe("env");
		expect(gemini?.maskedKey).toContain("ya29");
	}, 15000);

	test("clears gemini provider", async () => {
		await runCli(["auth", "set", "gemini", "--key", "ya29-gemini-test"]);
		const { exitCode } = await runCli(["auth", "clear", "gemini"]);
		expect(exitCode).toBe(0);

		const store = await readAuthStore();
		expect(store.providers.gemini).toBeUndefined();
	}, 15000);
});

describe("auth --help", () => {
	test("shows subcommands", async () => {
		const { stdout } = await runCli(["auth", "--help"]);
		expect(stdout).toContain("set");
		expect(stdout).toContain("status");
		expect(stdout).toContain("clear");
	});
});
