/**
 * @vocasync/astro - VocaSync integration for Astro
 *
 * Text-to-speech synthesis and word-level alignment for Astro static sites.
 *
 * @example
 * ```typescript
 * // astro.config.ts
 * import { defineConfig } from "astro/config";
 * import vocasync from "@vocasync/astro";
 *
 * export default defineConfig({
 *   integrations: [
 *     vocasync({
 *       collection: {
 *         name: "blog",
 *         path: "./src/content/blog",
 *       },
 *       language: "en-US",
 *     }),
 *   ],
 * });
 * ```
 */

// Astro Integration
export { default } from "./integration.js";
export { default as vocasync } from "./integration.js";

// Configuration
export {
  validateConfig,
  defaultConfig,
  VocaSyncConfigSchema,
  VoiceSchema,
  QualitySchema,
  FormatSchema,
  LanguageSchema,
} from "./config/index.js";

export type {
  VocaSyncConfig,
  VocaSyncUserConfig,
  Voice,
  Quality,
  Format,
  Language,
  MathStyle,
} from "./config/index.js";

// Types
export type {
  ContentItem,
  SpeechDocument,
  AlignedWord,
  AudioArtifact,
  AudioMap,
  SyncResult,
  SyncSummary,
  SyncStatus,
} from "./types/index.js";

// Core utilities (for advanced usage)
export { loadContent } from "./core/content-loader.js";
export { buildSpeechDocument } from "./core/speech-builder.js";
export { computeHash } from "./core/hash-manager.js";
export { loadAudioMap, saveAudioMap, getAudioEntry } from "./core/audio-map.js";
