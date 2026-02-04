import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { AudioMap, AudioArtifact } from "../types/index.js";

/**
 * Create an empty audio map structure
 */
export function createEmptyAudioMap(): AudioMap {
  return {
    version: 2,
    updatedAt: new Date().toISOString(),
    entries: {},
  };
}

/**
 * Load the audio map from disk.
 * Returns an empty map if the file doesn't exist.
 *
 * @param filePath - Path to audio-map.json
 */
export async function loadAudioMap(filePath: string): Promise<AudioMap> {
  try {
    const content = await readFile(filePath, "utf-8");
    const data = JSON.parse(content) as AudioMap;

    // Validate basic structure
    if (typeof data !== "object" || !data.entries) {
      console.warn(`Invalid audio-map.json structure at ${filePath}, creating new`);
      return createEmptyAudioMap();
    }

    return data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return createEmptyAudioMap();
    }
    throw error;
  }
}

/**
 * Save the audio map to disk.
 * Creates parent directories if they don't exist.
 *
 * @param filePath - Path to audio-map.json
 * @param audioMap - The audio map to save
 */
export async function saveAudioMap(filePath: string, audioMap: AudioMap): Promise<void> {
  // Update timestamp
  audioMap.updatedAt = new Date().toISOString();

  // Ensure directory exists
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });

  // Write with pretty formatting
  const content = JSON.stringify(audioMap, null, 2);
  await writeFile(filePath, content, "utf-8");
}

/**
 * Get an audio entry by slug.
 *
 * @param audioMap - The audio map
 * @param slug - The content slug
 * @returns The audio artifact or undefined
 */
export function getAudioEntry(audioMap: AudioMap, slug: string): AudioArtifact | undefined {
  return audioMap.entries[slug];
}

/**
 * Set an audio entry for a slug.
 *
 * @param audioMap - The audio map to modify
 * @param slug - The content slug
 * @param artifact - The audio artifact
 */
export function setAudioEntry(audioMap: AudioMap, slug: string, artifact: AudioArtifact): void {
  audioMap.entries[slug] = artifact;
}

/**
 * Remove an audio entry by slug.
 *
 * @param audioMap - The audio map to modify
 * @param slug - The content slug
 * @returns True if entry was removed
 */
export function removeAudioEntry(audioMap: AudioMap, slug: string): boolean {
  if (slug in audioMap.entries) {
    delete audioMap.entries[slug];
    return true;
  }
  return false;
}

/**
 * Get all slugs that have audio entries.
 *
 * @param audioMap - The audio map
 * @returns Array of slugs
 */
export function getAudioSlugs(audioMap: AudioMap): string[] {
  return Object.keys(audioMap.entries);
}
