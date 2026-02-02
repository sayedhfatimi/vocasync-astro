import type { AstroIntegration } from "astro";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { validateConfig, type VocaSyncUserConfig } from "./config/index.js";
import { loadAudioMap } from "./core/audio-map.js";
import type { AudioMap } from "./types/index.js";

// Cache for the loaded audio map
let audioMapCache: AudioMap | null = null;

/**
 * Load configuration from vocasync.config.ts/js/mjs.
 */
async function loadVocaSyncConfig(): Promise<VocaSyncUserConfig> {
  const cwd = process.cwd();

  for (const ext of [".ts", ".mjs", ".js"]) {
    const configFile = resolve(cwd, `vocasync.config${ext}`);
    if (existsSync(configFile)) {
      const fileUrl = `file://${configFile}`;
      const module = await import(fileUrl);
      return (module.default || module) as VocaSyncUserConfig;
    }
  }

  throw new Error(
    "No VocaSync configuration found.\n" +
      "Create a vocasync.config.mjs file with your configuration."
  );
}

/**
 * VocaSync Astro Integration.
 *
 * Provides:
 * - Virtual module `virtual:vocasync/audio-map` for accessing audio data
 * - Automatic rehype plugin for word-level highlighting
 * - Optional build-time sync command
 *
 * @example
 * ```typescript
 * // astro.config.mjs
 * import vocasync from "@vocasync/astro";
 *
 * export default defineConfig({
 *   integrations: [vocasync()],
 * });
 *
 * // vocasync.config.mjs
 * export default {
 *   collection: { name: "blog", path: "./src/content/blog" },
 * };
 * ```
 */
export default function vocasyncIntegration(): AstroIntegration {
  return {
    name: "@vocasync/astro",
    hooks: {
      "astro:config:setup": async ({ updateConfig, logger }) => {
        // Load config from vocasync.config.mjs
        let config;
        try {
          const userConfig = await loadVocaSyncConfig();
          config = validateConfig(userConfig);
        } catch (error) {
          logger.error(`Failed to load VocaSync config: ${error}`);
          throw error;
        }

        logger.info("VocaSync integration loaded");

        // Pre-load audio map for rehype plugin
        try {
          audioMapCache = await loadAudioMap(config.output.audioMapPath);
          logger.info(`Loaded audio map with ${Object.keys(audioMapCache.entries).length} entries`);
        } catch {
          logger.warn(
            `Audio map not found at ${config.output.audioMapPath}. Run 'npx vocasync sync' first.`
          );
          audioMapCache = { version: 1, updatedAt: "", entries: {} };
        }

        // Add virtual module for audio-map access
        updateConfig({
          vite: {
            plugins: [
              {
                name: "vite-plugin-vocasync",
                resolveId(id: string) {
                  if (id === "virtual:vocasync/audio-map") {
                    return "\0virtual:vocasync/audio-map";
                  }
                  if (id === "virtual:vocasync/config") {
                    return "\0virtual:vocasync/config";
                  }
                  return null;
                },
                async load(id: string) {
                  if (id === "\0virtual:vocasync/audio-map") {
                    // Return cached audio map
                    return `export default ${JSON.stringify(audioMapCache)};`;
                  }
                  if (id === "\0virtual:vocasync/config") {
                    // Export the validated config
                    return `export default ${JSON.stringify(config)};`;
                  }
                  return null;
                },
              },
            ],
          },
        });
      },

      "astro:build:done": ({ logger }) => {
        logger.info("VocaSync build complete");
      },
    },
  };
}

// Also export as named export
export { vocasyncIntegration as vocasync };
