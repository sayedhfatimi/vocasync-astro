import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { VocaSyncUserConfig } from "./schema.js";

/**
 * Load and execute a config file.
 * Uses file:// URLs for proper ESM import resolution.
 */
async function loadConfigFile(filePath: string): Promise<VocaSyncUserConfig> {
  try {
    const fileUrl = `file://${filePath}`;
    const module = await import(fileUrl);
    return (module.default || module) as VocaSyncUserConfig;
  } catch (error) {
    throw new Error(`Failed to load config from ${filePath}: ${error}`);
  }
}

/**
 * Discover and load a VocaSync configuration file.
 *
 * Searches for vocasync.config.{ts,mjs,js} in the current working directory,
 * or loads from an explicit path if provided.
 *
 * @param configPath - Optional explicit path to config file
 */
export async function loadVocaSyncConfig(configPath?: string): Promise<VocaSyncUserConfig> {
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
