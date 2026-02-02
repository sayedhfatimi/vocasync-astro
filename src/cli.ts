#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { validateConfig, type VocaSyncUserConfig } from "./config/index.js";
import { createClient } from "./api/client.js";
import { sync, checkConfig } from "./sync/orchestrator.js";

/**
 * Load .env file manually (no external dependency)
 */
async function loadEnvFile(): Promise<void> {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  
  try {
    const content = await readFile(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      
      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      
      // Don't override existing env vars
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // Ignore errors reading .env
  }
}

/**
 * ANSI color codes for terminal output
 */
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
};

function log(message: string, type: "info" | "success" | "warn" | "error" = "info"): void {
  const colorMap = {
    info: colors.cyan,
    success: colors.green,
    warn: colors.yellow,
    error: colors.red,
  };
  console.log(`${colorMap[type]}${message}${colors.reset}`);
}

function printBanner(): void {
  console.log(`
${colors.cyan}${colors.bold}╭────────────────────────────────────────╮
│            @vocasync/astro             │
│   Text-to-Speech for Astro Sites       │
╰────────────────────────────────────────╯${colors.reset}
`);
}

function printHelp(): void {
  console.log(`
${colors.bold}Usage:${colors.reset}
  vocasync <command> [options]

${colors.bold}Commands:${colors.reset}
  sync          Synthesize and align content
  check         Validate configuration
  status <id>   Check job status
  help          Show this help

${colors.bold}Options:${colors.reset}
  --only <slug>   Only process specific slug
  --force         Force reprocessing
  --dry-run       Preview without API calls
  --config <path> Config file path

${colors.bold}Environment:${colors.reset}
  VOCASYNC_API_KEY    Your VocaSync API key

${colors.bold}Examples:${colors.reset}
  ${colors.dim}# Sync all content${colors.reset}
  npx vocasync sync

  ${colors.dim}# Sync single post${colors.reset}
  npx vocasync sync --only my-post

  ${colors.dim}# Check configuration${colors.reset}
  npx vocasync check
`);
}

/**
 * Parse command line arguments.
 */
function parseArgs(args: string[]): {
  command: string;
  options: Record<string, string | boolean>;
  positional: string[];
} {
  const options: Record<string, string | boolean> = {};
  const positional: string[] = [];
  let command = "";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];

      // Check if next arg is a value or another flag
      if (nextArg && !nextArg.startsWith("--")) {
        options[key] = nextArg;
        i++;
      } else {
        options[key] = true;
      }
    } else if (!command) {
      command = arg;
    } else {
      positional.push(arg);
    }
  }

  return { command, options, positional };
}

/**
 * Load configuration from vocasync.config.ts/js/mjs.
 * 
 * @example
 * ```ts
 * // vocasync.config.mjs
 * export default {
 *   collection: { name: "articles", path: "./src/content/articles" },
 *   voice: { id: "aura-asteria-en", provider: "deepgram" },
 * };
 * ```
 */
async function loadConfig(configPath?: string): Promise<VocaSyncUserConfig> {
  const cwd = process.cwd();

  // Try explicit config path first
  if (configPath) {
    const fullPath = resolve(cwd, configPath);
    return loadConfigFile(fullPath);
  }

  // Try vocasync.config.ts / .mjs / .js
  for (const ext of [".ts", ".mjs", ".js"]) {
    const configFile = resolve(cwd, `vocasync.config${ext}`);
    if (existsSync(configFile)) {
      return await loadConfigFile(configFile);
    }
  }

  throw new Error(
    "No VocaSync configuration found.\n" +
      "Create a vocasync.config.mjs file with your configuration."
  );
}

/**
 * Load and execute a config file.
 * Uses file:// URLs for proper ESM import resolution.
 */
async function loadConfigFile(filePath: string): Promise<VocaSyncUserConfig> {
  try {
    // Use file:// URL for proper ESM resolution
    const fileUrl = `file://${filePath}`;
    const module = await import(fileUrl);
    return (module.default || module) as VocaSyncUserConfig;
  } catch (error) {
    throw new Error(`Failed to load config from ${filePath}: ${error}`);
  }
}

/**
 * Main CLI entry point.
 */
async function main(): Promise<void> {
  // Load .env file before anything else
  await loadEnvFile();

  const args = process.argv.slice(2);
  const { command, options, positional } = parseArgs(args);

  // Handle help
  if (!command || command === "help" || options.help) {
    printBanner();
    printHelp();
    process.exit(0);
  }

  printBanner();

  try {
    // Load configuration
    const userConfig = await loadConfig(options.config as string | undefined);
    const config = validateConfig(userConfig);
    const client = createClient(config);

    switch (command) {
      case "sync": {
        log("Starting sync...", "info");

        const summary = await sync(config, client, {
          only: options.only as string | undefined,
          force: Boolean(options.force),
          dryRun: Boolean(options["dry-run"]),
          onProgress: log,
        });

        console.log("");
        log(
          `Sync complete: ${summary.synced} synced, ${summary.unchanged} unchanged, ${summary.errors} errors`,
          summary.errors > 0 ? "warn" : "success"
        );

        process.exit(summary.errors > 0 ? 1 : 0);
        break;
      }

      case "check": {
        log("Checking configuration...", "info");

        const result = await checkConfig(config, client);

        if (result.valid) {
          log(result.message, "success");
          process.exit(0);
        } else {
          log(result.message, "error");
          process.exit(1);
        }
        break;
      }

      case "status": {
        const projectId = positional[0];
        if (!projectId) {
          log("Usage: vocasync status <projectUuid>", "error");
          process.exit(1);
        }

        log(`Checking status for ${projectId}...`, "info");
        const status = await client.getProjectStatus(projectId);

        console.log("");
        console.log(`${colors.bold}Project:${colors.reset} ${status.uuid}`);
        console.log(`${colors.bold}Name:${colors.reset} ${status.name}`);
        console.log(
          `${colors.bold}Synthesis:${colors.reset} ${status.synthesisJob?.status || "N/A"}`
        );
        console.log(
          `${colors.bold}Alignment:${colors.reset} ${status.alignmentJob?.status || "N/A"}`
        );

        if (status.synthesisJob?.audioUrl) {
          console.log(`${colors.bold}Audio:${colors.reset} ${status.synthesisJob.audioUrl}`);
        }
        if (status.alignmentJob?.alignmentUrl) {
          console.log(
            `${colors.bold}Alignment:${colors.reset} ${status.alignmentJob.alignmentUrl}`
          );
        }

        process.exit(0);
        break;
      }

      default:
        log(`Unknown command: ${command}`, "error");
        printHelp();
        process.exit(1);
    }
  } catch (error) {
    log(error instanceof Error ? error.message : String(error), "error");
    process.exit(1);
  }
}

main();
