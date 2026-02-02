import { createHash } from "node:crypto";

/**
 * Compute a SHA-256 hash of content for change detection.
 *
 * @param content - The content string to hash
 * @returns A hexadecimal hash string
 */
export function computeHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Compare two hashes to check if content has changed.
 *
 * @param oldHash - The previous hash
 * @param newHash - The new hash
 * @returns True if the hashes are different
 */
export function hasChanged(oldHash: string | undefined, newHash: string): boolean {
  return oldHash !== newHash;
}
