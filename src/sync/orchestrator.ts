import type { VocaSyncConfig } from "../config/index.js";
import type {
  ContentItem,
  AudioArtifact,
  AudioMap,
  SyncResult,
  SyncSummary,
  SyncStatus,
} from "../types/index.js";
import { loadContent } from "../core/content-loader.js";
import { buildSpeechDocument } from "../core/speech-builder.js";
import { loadAudioMap, saveAudioMap, getAudioEntry, setAudioEntry } from "../core/audio-map.js";
import { hasChanged } from "../core/hash-manager.js";
import { VocaSyncClient, getStreamingUrls } from "../api/client.js";

/**
 * Options for the sync operation.
 */
export interface SyncOptions {
  /** Only sync this specific slug */
  only?: string;
  /** Force reprocessing even if content unchanged */
  force?: boolean;
  /** Dry run - don't make API calls */
  dryRun?: boolean;
  /** Progress callback */
  onProgress?: (message: string, type?: "info" | "success" | "warn" | "error") => void;
}

/**
 * Orchestrate the full sync process.
 *
 * 1. Load content from collection
 * 2. Build speech documents
 * 3. Compare hashes to detect changes
 * 4. Submit synthesis jobs (with align=true)
 * 5. Poll until complete
 * 6. Update audio-map.json
 */
export async function sync(
  config: VocaSyncConfig,
  client: VocaSyncClient,
  options: SyncOptions = {}
): Promise<SyncSummary> {
  const { only, force = false, dryRun = false, onProgress = () => {} } = options;

  const results: SyncResult[] = [];
  let unchanged = 0;
  let synced = 0;
  let errors = 0;

  // Load existing audio map
  onProgress("Loading audio map...", "info");
  const audioMap = await loadAudioMap(config.output.audioMapPath);

  // Load content from collection
  onProgress(`Loading content from ${config.collection.name}...`, "info");
  let items = await loadContent(config.collection, config.frontmatterField);

  // Filter by slug if specified
  if (only) {
    items = items.filter((item) => item.slug === only);
    if (items.length === 0) {
      throw new Error(`No content found with slug: ${only}`);
    }
  }

  onProgress(`Found ${items.length} content items`, "info");

  // Process each item
  for (const item of items) {
    const result = await processItem(
      item,
      config,
      client,
      audioMap,
      { force, dryRun, onProgress }
    );

    results.push(result);

    if (result.status === "unchanged") {
      unchanged++;
    } else if (result.status === "error") {
      errors++;
    } else {
      synced++;
    }
  }

  // Save updated audio map
  if (!dryRun && synced > 0) {
    onProgress("Saving audio map...", "info");
    await saveAudioMap(config.output.audioMapPath, audioMap);
  }

  return {
    total: items.length,
    unchanged,
    synced,
    errors,
    results,
  };
}

/**
 * Process a single content item.
 */
async function processItem(
  item: ContentItem,
  config: VocaSyncConfig,
  client: VocaSyncClient,
  audioMap: AudioMap,
  options: {
    force: boolean;
    dryRun: boolean;
    onProgress: (message: string, type?: "info" | "success" | "warn" | "error") => void;
  }
): Promise<SyncResult> {
  const { force, dryRun, onProgress } = options;

  try {
    // Build speech document
    const speechDoc = await buildSpeechDocument(item, { math: config.math });

    // Check if content has changed
    const existingEntry = getAudioEntry(audioMap, item.slug);
    const contentChanged = hasChanged(existingEntry?.contentHash, speechDoc.hash);

    if (!force && !contentChanged && existingEntry) {
      onProgress(`⏭ ${item.slug} - unchanged`, "info");
      return { slug: item.slug, status: "unchanged" };
    }

    const status: SyncStatus = existingEntry ? "updated" : "new";
    onProgress(`📤 ${item.slug} - ${status}, submitting...`, "info");

    if (dryRun) {
      onProgress(`🔍 ${item.slug} - would ${status} (dry run)`, "info");
      return { slug: item.slug, status };
    }

    // Submit synthesis with align=true
    const response = await client.synthesize({
      name: `astro-${item.slug}`,
      text: speechDoc.text,
      voice: config.synthesis.voice,
      quality: config.synthesis.quality,
      language: config.language,
    });

    onProgress(`⏳ ${item.slug} - processing (${response.projectUuid})...`, "info");

    // Poll until complete
    const finalStatus = await client.pollUntilComplete(response.projectUuid, {
      onProgress: (status) => {
        const synthStatus = status.synthesisJob?.status || "pending";
        const alignStatus = status.alignmentJob?.status || "pending";
        onProgress(`   synth: ${synthStatus}, align: ${alignStatus}`, "info");
      },
    });

    // Fetch alignment data
    if (!finalStatus.alignmentJob?.alignmentUrl) {
      throw new Error("No alignment URL returned");
    }

    const alignmentData = await client.getAlignment(finalStatus.alignmentJob.alignmentUrl);

    // Get stable streaming URLs
    const streamingUrls = getStreamingUrls(response.projectUuid);

    // Create audio artifact (alignment data fetched at build time from alignmentUrl)
    const artifact: AudioArtifact = {
      projectUuid: response.projectUuid,
      contentHash: speechDoc.hash,
      duration: alignmentData.duration,
      audioUrl: streamingUrls.synthesisUrl,
      alignmentUrl: streamingUrls.alignmentUrl,
      createdAt: existingEntry?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Update audio map
    setAudioEntry(audioMap, item.slug, artifact);

    onProgress(`✅ ${item.slug} - ${status} complete`, "success");

    return {
      slug: item.slug,
      status,
      projectUuid: response.projectUuid,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    onProgress(`❌ ${item.slug} - error: ${message}`, "error");

    return {
      slug: item.slug,
      status: "error",
      error: message,
    };
  }
}

/**
 * Check if the configuration and API key are valid.
 */
export async function checkConfig(
  config: VocaSyncConfig,
  client: VocaSyncClient
): Promise<{ valid: boolean; message: string; balance?: number }> {
  try {
    // Validate API key
    const validation = await client.validateApiKey();

    if (!validation.valid) {
      return {
        valid: false,
        message: "Invalid API key. Check your VOCASYNC_API_KEY environment variable.",
      };
    }

    // Check content collection
    const items = await loadContent(config.collection, config.frontmatterField);

    return {
      valid: true,
      message: `Configuration valid. Found ${items.length} content items. Balance: $${validation.balance?.toFixed(2) ?? "?"}.`,
      balance: validation.balance,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      valid: false,
      message: `Configuration error: ${message}`,
    };
  }
}
