import type { VocaSyncConfig } from "../config/index.js";
import type {
  SynthesisResponse,
  ProjectStatus,
  ProjectResponse,
  AlignmentData,
  AlignedWord,
} from "../types/index.js";

/**
 * VocaSync API client for synthesis and alignment operations.
 */
export class VocaSyncClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(apiKey: string, baseUrl = "https://vocasync.io/api/v1") {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  /**
   * Make an authenticated API request.
   */
  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new VocaSyncAPIError(
        `API request failed: ${response.status} ${response.statusText}`,
        response.status,
        errorBody
      );
    }

    return response.json() as T;
  }

  /**
   * Create a synthesis project with alignment.
   *
   * Uses the `align=true` flag to automatically create a linked alignment project
   * that starts processing once synthesis completes.
   */
  async synthesize(params: {
    name: string;
    text: string;
    voice: string;
    quality: "sd" | "hd";
    language: string;
  }): Promise<SynthesisResponse> {
    const url = `${this.baseUrl}/synthesis`;

    // API expects multipart/form-data
    const formData = new FormData();
    formData.append("textType", "text");
    formData.append("text", params.text);
    formData.append("voice", params.voice);
    formData.append("quality", params.quality);
    formData.append("language", params.language);
    formData.append("projectName", params.name);
    formData.append("align", "true"); // Auto-create alignment project

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        // Don't set Content-Type - let fetch set it with boundary for FormData
      },
      body: formData,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new VocaSyncAPIError(
        `API request failed: ${response.status} ${response.statusText}`,
        response.status,
        errorBody
      );
    }

    return (await response.json()) as SynthesisResponse;
  }

  /**
   * Get project status including synthesis and alignment job status.
   */
  async getProjectStatus(projectUuid: string): Promise<ProjectStatus> {
    // Fetch full project from the API
    const project = await this.request<ProjectResponse>("GET", `/projects/${projectUuid}`);

    // Find synthesis artifact
    const synthesisArtifact = project.artifacts.find(a => a.artifactType === "synthesis");

    // Map to internal ProjectStatus format
    const status: ProjectStatus = {
      uuid: project.projectUuid,
      name: project.name || "",
      status: project.status,
    };

    // Add synthesis job info if we have a synthesis artifact or this is a synthesis project
    if (synthesisArtifact || project.projectType === "synthesis") {
      status.synthesisJob = {
        status: project.status,
        duration: project.audioFileDurationSeconds || undefined,
        error: project.error || undefined,
      };
      if (synthesisArtifact?.synthesisFileKey) {
        status.synthesisJob.audioUrl = `/stream/${projectUuid}/synthesis`;
      }
    }

    // Add alignment job info from linked alignment project (for synthesis with align=true)
    if (project.linkedAlignment) {
      status.alignmentJob = {
        status: project.linkedAlignment.status,
        error: project.linkedAlignment.error || undefined,
      };
      // Alignment URL is on the synthesis project (uses linkedAlignmentProjectId internally)
      if (project.linkedAlignment.status === "completed") {
        status.alignmentJob.alignmentUrl = `/stream/${projectUuid}/alignment`;
      }
    }

    return status;
  }

  /**
   * Fetch alignment data (words with timestamps) from completed alignment job.
   */
  async getAlignment(alignmentUrl: string): Promise<AlignmentData> {
    // The alignmentUrl may be a full URL or relative
    const url = alignmentUrl.startsWith("http")
      ? alignmentUrl
      : `${this.baseUrl}${alignmentUrl}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new VocaSyncAPIError(
        `Failed to fetch alignment: ${response.status}`,
        response.status
      );
    }

    const data = await response.json() as { words: AlignedWord[]; duration: number };
    return data;
  }

  /**
   * Poll project status until completion or failure.
   *
   * @param projectUuid - The project to poll
   * @param options - Polling options
   * @returns The final project status
   */
  async pollUntilComplete(
    projectUuid: string,
    options: {
      maxAttempts?: number;
      intervalMs?: number;
      onProgress?: (status: ProjectStatus) => void;
    } = {}
  ): Promise<ProjectStatus> {
    const { maxAttempts = 120, intervalMs = 5000, onProgress } = options;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const status = await this.getProjectStatus(projectUuid);

      onProgress?.(status);

      // Check if synthesis is complete
      const synthComplete =
        status.synthesisJob?.status === "completed" ||
        status.synthesisJob?.status === "failed";

      // For alignment: if synthesis is complete but alignment job doesn't exist yet,
      // keep polling because the backend may still be creating the linked alignment project
      const alignComplete =
        status.alignmentJob?.status === "completed" ||
        status.alignmentJob?.status === "failed";

      // Only exit when synth is complete AND either:
      // 1. Alignment is complete/failed, OR
      // 2. We've polled enough times after synth completion that alignment should have started
      //    (alignment job will appear as "pending" or "processing" once linked)
      const shouldWaitForAlignment = synthComplete && !status.alignmentJob;
      
      if (synthComplete && alignComplete) {
        // Check for failures
        if (status.synthesisJob?.status === "failed") {
          throw new VocaSyncAPIError(
            `Synthesis failed: ${status.synthesisJob.error || "Unknown error"}`,
            500
          );
        }
        if (status.alignmentJob?.status === "failed") {
          throw new VocaSyncAPIError(
            `Alignment failed: ${status.alignmentJob.error || "Unknown error"}`,
            500
          );
        }

        return status;
      }

      // If synthesis is complete but no alignment job yet, wait a bit longer
      // The backend creates the alignment project asynchronously after synthesis
      if (shouldWaitForAlignment && attempt > 5) {
        // After 5 additional polls with no alignment appearing, assume it won't be created
        // This handles the case where align=false or alignment language isn't supported
        return status;
      }

      // Wait before next poll
      await sleep(intervalMs);
    }

    throw new VocaSyncAPIError("Polling timeout - job did not complete in time", 408);
  }

  /**
   * Check API key validity and account balance.
   */
  async validateApiKey(): Promise<{ valid: boolean; balance?: number }> {
    try {
      const response = await this.request<{ balance: number }>("GET", "/account");
      return { valid: true, balance: response.balance };
    } catch (error) {
      if (error instanceof VocaSyncAPIError && error.statusCode === 401) {
        return { valid: false };
      }
      throw error;
    }
  }
}

/**
 * Custom error class for VocaSync API errors.
 */
export class VocaSyncAPIError extends Error {
  statusCode: number;
  responseBody?: string;

  constructor(message: string, statusCode: number, responseBody?: string) {
    super(message);
    this.name = "VocaSyncAPIError";
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

/**
 * Sleep utility for polling.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a VocaSync client from configuration.
 */
export function createClient(_config: VocaSyncConfig): VocaSyncClient {
  const apiKey = process.env.VOCASYNC_API_KEY;

  if (!apiKey) {
    throw new Error(
      "VOCASYNC_API_KEY environment variable is not set.\n" +
        "Get your API key at https://vocasync.io and add it to your .env file."
    );
  }

  return new VocaSyncClient(apiKey);
}

/**
 * Get streaming URLs for stable audio/alignment access.
 * These URLs don't expire and redirect to fresh presigned URLs on each request.
 */
export function getStreamingUrls(
  projectUuid: string,
  baseUrl = "https://vocasync.io/api/v1"
): {
  synthesisUrl: string;
  alignmentUrl: string;
  srtUrl: string;
  vttUrl: string;
} {
  return {
    synthesisUrl: `${baseUrl}/stream/${projectUuid}/synthesis`,
    alignmentUrl: `${baseUrl}/stream/${projectUuid}/alignment`,
    srtUrl: `${baseUrl}/stream/${projectUuid}/subtitles.srt`,
    vttUrl: `${baseUrl}/stream/${projectUuid}/subtitles.vtt`,
  };
}
