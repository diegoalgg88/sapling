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
		if (process.env.GEMINI_API_KEY) {
			env.GEMINI_API_KEY = process.env.GEMINI_API_KEY;
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
		description:
			"Execute a coding task using Sapling headless agent with configurable model and backend. " +
			"Supports providers: Anthropic (claude-sonnet-4-5), Nvidia (qwen3-coder-480b), MiniMax, Qwen, Gemini. " +
			"Use --backend sdk for provider-specific features, --backend openai for compatibility.",
		parameters: {
			type: "object",
			properties: {
				prompt: {
					type: "string",
					description: "Task description to execute (required). Be specific about what you want.",
					examples: [
						"Fix the null pointer exception in UserService.java line 45",
						"Add unit tests for the authentication module",
						"Refactor the database connection pooling to use HikariCP",
						"Implement rate limiting for the API endpoints",
					],
				},
				model: {
					type: "string",
					description: "Model to use. Examples: qwen/qwen3-coder-480b (Nvidia), claude-sonnet-4-5 (Anthropic), minimax/minimax-m2.5, gemini-2.0-flash",
					examples: ["qwen/qwen3-coder-480b", "claude-sonnet-4-5", "minimax/minimax-m2.5", "gemini-2.0-flash"],
				},
				backend: {
					type: "string",
					description: "LLM backend. 'sdk' for provider-native features, 'openai' for compatibility",
					enum: ["openai", "sdk"],
				},
				maxTurns: {
					type: "number",
					description: "Maximum number of agent turns (default: 200, range: 1-500)",
					minimum: 1,
					maximum: 500,
				},
				verbose: {
					type: "boolean",
					description: "Enable verbose logging for debugging",
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
						maxTurns: params.maxTurns || "default",
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
		description:
			"Store API key for a provider. Supported providers:\n" +
			"- anthropic: Claude models (claude-sonnet-4-5)\n" +
			"- nvidia: Nvidia NIM models (qwen3-coder-480b)\n" +
			"- qwen: Qwen models via DashScope\n" +
			"- minimax: MiniMax models (requires base-url)\n" +
			"- gemini: Google Gemini models (gemini-2.0-flash, gemma-3b)",
		parameters: {
			type: "object",
			properties: {
				provider: {
					type: "string",
					description: "Provider name",
					enum: ["anthropic", "minimax", "nvidia", "qwen", "gemini"],
					examples: ["nvidia", "anthropic", "qwen", "gemini"],
				},
				apiKey: {
					type: "string",
					description: "API key to store (e.g., nvapi-xxx for Nvidia, sk-ant-xxx for Anthropic)",
					examples: ["nvapi-xxx", "sk-ant-xxx", "sk-xxx"],
				},
				baseUrl: {
					type: "string",
					description: "Optional base URL override. Required for minimax: https://api.minimax.io/anthropic",
					examples: ["https://api.minimax.io/anthropic"],
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
							text: `✓ Stored API key for ${params.provider}\n` +
								`Run /sapling auth status to verify configuration`,
						},
					],
					details: {
						provider: params.provider,
						configured: true,
						baseUrl: params.baseUrl || "default",
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
		description: "Show which providers are configured with their API key status (set/unset)",
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
					content: [
						{
							type: "text",
							text: output || "No providers configured yet.\n" +
								"Use sapling_auth_set tool or run: /sapling auth set <provider> --key <key>",
						},
					],
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
			const subcommands = ["run", "init", "doctor", "config", "auth", "upgrade", "version", "completions"];
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
						// Show usage with examples
						ctx.ui?.notify?.(
							"Usage: /sapling run <prompt> [--model <name>] [--backend openai|sdk] [--max-turns N]\n\n" +
							"Examples:\n" +
							"  /sapling run 'Fix the null pointer exception in UserService'\n" +
							"  /sapling run 'Add unit tests for auth module' --model qwen/qwen3-coder-480b\n" +
							"  /sapling run 'Refactor database layer' --backend sdk --max-turns 50",
							"info",
						);
						return;
					case "init":
						output = await runSpCommand("sp init", ctx);
						ctx.ui?.notify?.(output || "Sapling initialized successfully", "info");
						return;
					case "doctor":
						output = await runSpCommand("sp doctor", ctx);
						ctx.ui?.notify?.(output || "Health checks completed", "info");
						return;
					case "config":
						const configArgs = parts.slice(1).join(" ");
						if (configArgs) {
							// Handle config subcommands: get, set, list
							if (configArgs.startsWith("set")) {
								ctx.ui?.notify?.("Usage: Use sapling_auth_set tool or 'sp auth set <provider>'", "info");
								return;
							}
							output = await runSpCommand(`sp config ${configArgs}`, ctx);
						} else {
							output = await runSpCommand("sp config", ctx);
						}
						ctx.ui?.notify?.(output || "Configuration displayed", "info");
						return;
					case "auth":
						const authArgs = parts.slice(1).join(" ");
						if (authArgs) {
							// Handle auth subcommands: set, status, remove
							if (authArgs.startsWith("set")) {
								const providerMatch = authArgs.match(/set\s+(\w+)/);
								if (providerMatch) {
									ctx.ui?.notify?.(
										`To set ${providerMatch[1]} API key, use:\n` +
										`  /sapling auth set ${providerMatch[1]} --key <your-key>\n` +
										`Or use the sapling_auth_set tool`,
										"info",
									);
									return;
								}
							}
							output = await runSpCommand(`sp auth ${authArgs}`, ctx);
						} else {
							output = await runSpCommand("sp auth status", ctx);
						}
						ctx.ui?.notify?.(output || "Auth status displayed", "info");
						return;
					case "upgrade":
						ctx.ui?.notify?.("Checking for Sapling updates...", "info");
						output = await runSpCommand("sp upgrade", ctx);
						ctx.ui?.notify?.(output || "Upgrade check completed", "info");
						return;
					case "version":
						output = await runSpCommand("sp version", ctx);
						ctx.ui?.notify?.(output || "Version displayed", "info");
						return;
					case "completions":
						const shell = parts[1];
						if (!shell) {
							ctx.ui?.notify?.("Usage: /sapling completions <bash|zsh|fish>", "warning");
							return;
						}
						output = await runSpCommand(`sp completions ${shell}`, ctx);
						ctx.ui?.notify?.("Shell completions generated", "info");
						return;
					case "":
						// Show status by default
						output = await runSpCommand("sp --version", ctx);
						ctx.ui?.notify?.(`Sapling version: ${output}`, "info");
						return;
					default:
						ctx.ui?.notify?.(`Unknown subcommand: ${subcommand}`, "warning");
						ctx.ui?.notify?.(
							"Available: run, init, doctor, config, auth, upgrade, version, completions",
							"info",
						);
						return;
				}
			} catch (error: any) {
				ctx.ui?.notify?.(`Sapling error: ${error.message}`, "error");
			}
		},
	});

	logger.log("Sapling extension loaded");
}
