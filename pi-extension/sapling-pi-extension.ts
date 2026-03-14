/**
 * Sapling Agent Extension for Pi (Google ADK)
 *
 * Auto-installed by `bun install` in @os-eco/sapling-cli
 *
 * This extension integrates Sapling headless coding agent with Pi,
 * providing task execution, context management, and session tracking.
 */

import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, parse } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

// Sapling state management
interface SaplingState {
	sessionInitialized: boolean;
	lastRunId: string | null;
	currentTask: string | null;
}

const state: SaplingState = {
	sessionInitialized: false,
	lastRunId: null,
	currentTask: null,
};

const logger = {
	log: (msg: string) => console.log("[Sapling]", msg),
	debug: (msg: string, ...args: unknown[]) => console.debug("[Sapling]", msg, ...args),
	warn: (msg: string) => console.warn("[Sapling]", msg),
	error: (msg: string, err?: unknown) => console.error("[Sapling]", msg, err),
};

/**
 * Get the full path to sapling CLI.
 */
function getSpPath(): string {
	const home = homedir();
	const binName = process.platform === "win32" ? "sp.exe" : "sp";
	const bunBinPath = join(home, ".bun", "bin", binName);

	if (existsSync(bunBinPath)) return bunBinPath;
	return "sp";
}

/**
 * Find the project root by searching upwards for a .git directory.
 * Falls back to process.cwd() if no .git is found.
 */
function findProjectRoot(startDir: string = process.cwd()): string {
	let currentDir = startDir;
	const root = parse(currentDir).root;

	while (currentDir && currentDir !== root) {
		if (existsSync(join(currentDir, ".git"))) {
			return currentDir;
		}
		const parent = dirname(currentDir);
		if (parent === currentDir) break;
		currentDir = parent;
	}
	return startDir;
}

/**
 * Check if sapling CLI is available.
 */
async function isSaplingAvailable(): Promise<boolean> {
	try {
		const { exec } = await import("child_process");
		const { promisify } = await import("util");
		const execAsync = promisify(exec);

		const spPath = getSpPath();

		await execAsync(`"${spPath}" --version`, {
			timeout: 5000,
		});
		return true;
	} catch {
		return false;
	}
}

/**
 * Execute Sapling command asynchronously.
 * Returns stdout or throws on error.
 */
async function runSpCommand(cmd: string, ctx?: ExtensionContext): Promise<string> {
	try {
		const { exec } = await import("child_process");
		const { promisify } = await import("util");
		const execAsync = promisify(exec);

		// Use full path to sp CLI
		const spPath = getSpPath();
		const fullCmd = cmd.replace(/^sp\b/, spPath);

		const projectRoot = findProjectRoot();

		// Build environment with Sapling API keys from Pi's environment
		const env: Record<string, string> = {
			...process.env,
			PI_PROJECT_DIR: projectRoot,
		};

		// Propagate Sapling API key if set in Pi's environment
		if (process.env.SAPLING_API_KEY) {
			env.SAPLING_API_KEY = process.env.SAPLING_API_KEY;
		}
		// Propagate provider-specific keys
		if (process.env.NVIDIA_API_KEY) {
			env.NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
		}
		if (process.env.Z_AI_API_KEY) {
			env.Z_AI_API_KEY = process.env.Z_AI_API_KEY;
		}
		if (process.env.QWEN_API_KEY) {
			env.QWEN_API_KEY = process.env.QWEN_API_KEY;
		}
		if (process.env.ANTHROPIC_API_KEY) {
			env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
		}
		if (process.env.MINIMAX_API_KEY) {
			env.MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
		}

		const result = await execAsync(fullCmd, {
			timeout: 30000,
			cwd: projectRoot,
			env,
		});

		return result.stdout?.trim() || "";
	} catch (error: any) {
		// Check if it's a "command not found" error
		if (
			error.code === "ENOENT" ||
			error.stderr?.includes("no se reconoce") ||
			error.stderr?.includes("not recognized")
		) {
			logger.debug("Sapling CLI not found - command not available");
			throw new Error("Sapling CLI not found - run `bun install -g @os-eco/sapling-cli`");
		}
		logger.debug("Sapling command failed", error);
		throw error;
	}
}

/**
 * Initialize Sapling agent.
 */
async function initializeSapling(ctx: ExtensionContext): Promise<void> {
	if (state.sessionInitialized) return;

	state.sessionInitialized = true;

	try {
		// Check if Sapling CLI is available
		const saplingAvailable = await isSaplingAvailable();
		if (!saplingAvailable) {
			logger.debug("Sapling CLI not found - skipping initialization");
			return;
		}

		// Check if .sapling/ directory exists in current project
		const projectDir = findProjectRoot();
		const gitDirExists = existsSync(join(projectDir, ".git"));
		const saplingDir = join(projectDir, ".sapling");
		const saplingDirExists = existsSync(saplingDir);

		if (!saplingDirExists) {
			if (!gitDirExists) {
				logger.debug("No .git/ directory found - Sapling requires a git repository");
				ctx.ui?.notify?.(
					"Sapling: No .git/ directory found. Please run `git init` first.",
					"warning",
				);
				return;
			}

			// Auto-create directory as suggested by user
			try {
				logger.debug(`Auto-creating missing directory: ${saplingDir}`);
				mkdirSync(saplingDir, { recursive: true });
				ctx.ui?.notify?.(
					`Sapling: Created missing .sapling/ directory at ${saplingDir}. Run \`sp init\` to complete setup.`,
					"info",
				);
			} catch (error) {
				logger.debug(`Failed to auto-create directory: ${saplingDir}`, error);
				ctx.ui?.notify?.(
					`Sapling: No .sapling/ directory found at ${saplingDir}. Run \`sp init\` to initialize.`,
					"info",
				);
			}
			return;
		}

		logger.log("Sapling initialized successfully");
		ctx.ui?.notify?.("Sapling: Ready to execute tasks", "info");
	} catch (error: any) {
		// Silent fail if sapling is not initialized in this project
		if (error.stderr?.includes("No .sapling/") || error.message?.includes("not initialized")) {
			logger.debug("Sapling not initialized in current project");
			ctx.ui?.notify?.("Sapling: Run `sp init` to initialize", "info");
			return;
		}
		// Silent fail if sapling CLI is not available
		if (error.message?.includes("CLI not found")) {
			logger.debug("Sapling CLI not installed");
			return;
		}
		logger.debug("Failed to initialize Sapling", error);
		ctx.ui?.notify?.("Sapling initialization failed", "error");
	}
}

/**
 * Main extension factory function.
 */
export default function (pi: ExtensionAPI) {
	// ========================================
	// SESSION LIFECYCLE
	// ========================================

	/**
	 * Session Start - Initialize Sapling
	 */
	pi.on("session_start", async (_event: any, ctx: ExtensionContext) => {
		logger.log("Session started - initializing Sapling");
		await initializeSapling(ctx);
	});

	/**
	 * Session Shutdown - Cleanup
	 */
	pi.on("session_shutdown", async (_event: any, ctx: ExtensionContext) => {
		logger.log("Session shutting down");
		state.sessionInitialized = false;
		state.currentTask = null;
	});

	// ========================================
	// CUSTOM TOOLS
	// ========================================

	/**
	 * sapling_run - Execute a task with Sapling
	 */
	pi.registerTool({
		name: "sapling_run",
		label: "Run Sapling Task",
		description: "Execute a coding task using Sapling headless agent with configurable model and backend",
		parameters: {
			type: "object",
			properties: {
				prompt: {
					type: "string",
					description: "Task description to execute",
				},
				model: {
					type: "string",
					description: "Model to use (e.g., qwen/qwen3-coder-480b, claude-sonnet-4-5, MiniMax-M2.5)",
				},
				backend: {
					type: "string",
					description: "LLM backend (openai or sdk)",
					enum: ["openai", "sdk"],
				},
				maxTurns: {
					type: "number",
					description: "Maximum number of turns (default: 200)",
				},
				verbose: {
					type: "boolean",
					description: "Enable verbose logging",
				},
			},
			required: ["prompt"],
		} as any,
		async execute(
			_toolCallId: string,
			params: any,
			_signal: any,
			_onUpdate: any,
			ctx: ExtensionContext,
		) {
			try {
				let cmd = `sp run "${params.prompt.replace(/"/g, '\\"')}"`;

				if (params.backend) {
					cmd += ` --backend ${params.backend}`;
				}
				if (params.model) {
					cmd += ` --model ${params.model}`;
				}
				if (params.maxTurns) {
					cmd += ` --max-turns ${params.maxTurns}`;
				}
				if (params.verbose) {
					cmd += ` --verbose`;
				}

				const output = await runSpCommand(cmd, ctx);
				state.lastRunId = `run-${Date.now()}`;

				return {
					content: [{ type: "text", text: output || "Task executed successfully" }],
					details: {
						runId: state.lastRunId,
						task: params.prompt,
						model: params.model || "default",
						backend: params.backend || "default",
					},
				};
			} catch (error: any) {
				return {
					content: [{ type: "text", text: `Sapling error: ${error.message}` }],
					details: { error: String(error) },
					isError: true,
				};
			}
		},
	});

	/**
	 * sapling_status - Get Sapling status
	 */
	pi.registerTool({
		name: "sapling_status",
		label: "Get Sapling Status",
		description: "Check Sapling configuration and status",
		parameters: {} as any,
		async execute(
			_toolCallId: string,
			_params: any,
			_signal: any,
			_onUpdate: any,
			ctx: ExtensionContext,
		) {
			try {
				const output = await runSpCommand("sp --version", ctx);
				return {
					content: [{ type: "text", text: `Sapling version: ${output}` }],
					details: {},
				};
			} catch (error: any) {
				return {
					content: [{ type: "text", text: `Failed to get status: ${error.message}` }],
					details: { error: String(error) },
					isError: true,
				};
			}
		},
	});

	/**
	 * sapling_auth_set - Configure API key for a provider
	 */
	pi.registerTool({
		name: "sapling_auth_set",
		label: "Configure Sapling API Key",
		description: "Store API key for a provider (anthropic, minimax, nvidia, qwen)",
		parameters: {
			type: "object",
			properties: {
				provider: {
					type: "string",
					description: "Provider name (anthropic, minimax, nvidia, qwen)",
					enum: ["anthropic", "minimax", "nvidia", "qwen"],
				},
				apiKey: {
					type: "string",
					description: "API key to store",
				},
				baseUrl: {
					type: "string",
					description: "Optional base URL override (required for minimax)",
				},
			},
			required: ["provider", "apiKey"],
		} as any,
		async execute(
			_toolCallId: string,
			params: any,
			_signal: any,
			_onUpdate: any,
			ctx: ExtensionContext,
		) {
			try {
				let cmd = `sp auth set ${params.provider} --key ${params.apiKey}`;

				if (params.baseUrl) {
					cmd += ` --base-url ${params.baseUrl}`;
				}

				await runSpCommand(cmd, ctx);

				return {
					content: [
						{
							type: "text",
							text: `✓ Stored API key for ${params.provider}`,
						},
					],
					details: {
						provider: params.provider,
						configured: true,
					},
				};
			} catch (error: any) {
				return {
					content: [
						{
							type: "text",
							text: `Failed to configure provider: ${error.message}`,
						},
					],
					details: { error: String(error) },
					isError: true,
				};
			}
		},
	});

	/**
	 * sapling_auth_status - Show configured providers
	 */
	pi.registerTool({
		name: "sapling_auth_status",
		label: "Show Sapling Auth Status",
		description: "Show which providers are configured",
		parameters: {} as any,
		async execute(
			_toolCallId: string,
			_params: any,
			_signal: any,
			_onUpdate: any,
			ctx: ExtensionContext,
		) {
			try {
				const output = await runSpCommand("sp auth status", ctx);
				return {
					content: [{ type: "text", text: output }],
					details: {},
				};
			} catch (error: any) {
				return {
					content: [{ type: "text", text: `Failed to get auth status: ${error.message}` }],
					details: { error: String(error) },
					isError: true,
				};
			}
		},
	});

	// ========================================
	// CUSTOM COMMANDS
	// ========================================

	/**
	 * /sapling - Sapling agent commands
	 */
	pi.registerCommand("sapling", {
		description: "Sapling headless coding agent",
		getArgumentCompletions: (prefix: string) => {
			const subcommands = ["run", "status", "init", "doctor", "config"];
			const filtered = subcommands.filter((s: string) => s.startsWith(prefix));
			return filtered.length > 0 ? filtered.map((s) => ({ value: s, label: s })) : null;
		},
		handler: async (args: string, ctx: ExtensionContext) => {
			const parts = args.trim().split(/\s+/);
			const subcommand = parts[0] || "";

			try {
				let output: string;

				switch (subcommand) {
					case "run":
						ctx.ui?.notify?.("Usage: /sapling run <prompt> [--model <name>]", "info");
						return;
					case "status":
						output = await runSpCommand("sp --version", ctx);
						break;
					case "init":
						output = await runSpCommand("sp init", ctx);
						break;
					case "doctor":
						output = await runSpCommand("sp doctor", ctx);
						break;
					case "":
						// Show status by default
						output = await runSpCommand("sp --version", ctx);
						break;
					default:
						ctx.ui?.notify?.(`Unknown subcommand: ${subcommand}`, "warning");
						ctx.ui?.notify?.("Available: run, status, init, doctor", "info");
						return;
				}

				ctx.ui?.notify?.(output || "Command executed", "info");
			} catch (error: any) {
				ctx.ui?.notify?.(`Sapling error: ${error.message}`, "error");
			}
		},
	});

	logger.log("Sapling extension loaded");
}
