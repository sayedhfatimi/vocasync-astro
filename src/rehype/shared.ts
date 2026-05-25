import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AudioMap } from "../types/index.js";

let audioMapCache: AudioMap | null = null;
let audioMapCachePath: string | null = null;

/** Load + cache the audio map from disk (returns null if missing/invalid). */
export function loadAudioMapSync(audioMapPath: string): AudioMap | null {
  if (audioMapCache && audioMapCachePath === audioMapPath) return audioMapCache;
  try {
    const content = readFileSync(resolve(process.cwd(), audioMapPath), "utf-8");
    audioMapCache = JSON.parse(content) as AudioMap;
    audioMapCachePath = audioMapPath;
    return audioMapCache;
  } catch {
    return null;
  }
}

/** Resolve a content slug from a VFile path, preferring the collection folder. */
export function resolveSlug(
  file: { path?: string; history?: string[] },
  collectionName: string
): string | undefined {
  const filePath =
    file.path ?? (Array.isArray(file.history) ? file.history[file.history.length - 1] : undefined);
  if (!filePath) return undefined;
  const normalized = filePath.replace(/\\/g, "/");
  const collectionMatch = normalized.match(
    new RegExp(`/content/${collectionName}/([^/]+)\\.(md|mdx)$`)
  );
  if (collectionMatch) return collectionMatch[1];
  const filenameMatch = normalized.match(/\/([^/]+)\.(md|mdx)$/);
  return filenameMatch ? filenameMatch[1] : undefined;
}
