#!/usr/bin/env bun
/**
 * Install Sapling Pi Extension
 *
 * Copies the extension to ~/.pi/agent/extensions/
 *
 * This script is designed to be idempotent and safe to run multiple times.
 * It's automatically executed as a postinstall hook when running `bun install`.
 *
 * NOTE: This script ONLY copies the extension file. It does NOT modify
 * ~/.pi/agent/settings.json. Users must manually register the extension
 * in their settings.json if they want it to load automatically.
 */

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const projectRoot = join(import.meta.dir, "..");

const PI_DIR = join(homedir(), ".pi", "agent");
const EXTENSIONS_DIR = join(PI_DIR, "extensions");
const SOURCE_EXTENSION = join(projectRoot, "pi-extension", "sapling-pi-extension.ts");
const DEST_EXTENSION = join(EXTENSIONS_DIR, "sapling-pi-extension.ts");

console.log("🛠️  Installing Sapling Pi Extension...");

// Check if Pi is installed
if (!existsSync(PI_DIR)) {
	console.log("ℹ️  Pi directory not found (~/.pi/agent). Skipping extension installation.");
	console.log("💡 Extension file copied to: ~/.pi/agent/extensions/ (manual registration required)");
	process.exit(0);
}

// Check if source extension exists
if (!existsSync(SOURCE_EXTENSION)) {
	console.error(`❌ Source extension not found: ${SOURCE_EXTENSION}`);
	process.exit(1);
}

// Ensure extensions directory exists
if (!existsSync(EXTENSIONS_DIR)) {
	try {
		console.log(`📁 Creating extensions directory: ${EXTENSIONS_DIR}`);
		mkdirSync(EXTENSIONS_DIR, { recursive: true });
	} catch (error) {
		console.error(`❌ Failed to create extensions directory: ${error}`);
		process.exit(1);
	}
}

// Copy extension file
try {
	console.log(`📝 Copying extension to: ${DEST_EXTENSION}`);
	copyFileSync(SOURCE_EXTENSION, DEST_EXTENSION);
	console.log("✅ Sapling Pi Extension copied successfully!");
	console.log("");
	console.log("📝 NOTE: Extension file copied but NOT automatically registered.");
	console.log("💡 To enable the extension, add this to ~/.pi/agent/settings.json:");
	console.log('   { "extensions": ["~/.pi/agent/extensions/sapling-pi-extension.ts"] }');
} catch (error) {
	console.error(`❌ Failed to copy extension: ${error}`);
	process.exit(1);
}
