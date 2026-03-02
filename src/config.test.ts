import { describe, expect, it } from "bun:test";
import { DEFAULT_CONFIG, loadConfig, validateConfig } from "./config.ts";
import { ConfigError } from "./errors.ts";

describe("validateConfig", () => {
	it("returns merged config with defaults", () => {
		const config = validateConfig({});
		expect(config.model).toBe(DEFAULT_CONFIG.model);
		expect(config.backend).toBe("cc");
		expect(config.maxTurns).toBe(200);
	});

	it("applies overrides", () => {
		const config = validateConfig({ model: "claude-opus-4-6", maxTurns: 50 });
		expect(config.model).toBe("claude-opus-4-6");
		expect(config.maxTurns).toBe(50);
	});

	it("throws ConfigError for maxTurns < 1", () => {
		expect(() => validateConfig({ maxTurns: 0 })).toThrow(ConfigError);
	});

	it("throws ConfigError for invalid backend", () => {
		expect(() => validateConfig({ backend: "invalid" as "cc" })).toThrow(ConfigError);
	});

	it("throws ConfigError for contextWindow < 1000", () => {
		expect(() => validateConfig({ contextWindow: 500 })).toThrow(ConfigError);
	});

	it("throws ConfigError when budget allocations exceed 1.0", () => {
		expect(() =>
			validateConfig({
				contextBudget: {
					windowSize: 200_000,
					allocations: {
						systemPrompt: 0.5,
						archiveSummary: 0.5,
						recentHistory: 0.5,
						currentTurn: 0.5,
						headroom: 0.5,
					},
				},
			}),
		).toThrow(ConfigError);
	});
});

describe("loadConfig", () => {
	it("returns default config with no overrides", () => {
		const config = loadConfig();
		expect(config.model).toBe(DEFAULT_CONFIG.model);
	});

	it("applies overrides", () => {
		const config = loadConfig({ maxTurns: 10 });
		expect(config.maxTurns).toBe(10);
	});
});
