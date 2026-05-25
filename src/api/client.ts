import type { VocaSyncConfig } from "../config/index.js";
import type {
  AlignedWord,
  AlignmentPresignResponse,
  AlignmentSubmitResponse,
  ProjectResponse,
  ProjectStatus,
  SynthesisResponse,
} from "../types/index.js";

/**
 * Map a synthesis language (ISO 639-1) to its alignment locale (BCP-47).
 * Only the alignment-supported set is valid; defaults to en-US.
 */
export const SYNTHESIS_TO_ALIGNMENT_LANGUAGE: Record<string, string> = {
  en: "en-US",
  fr: "fr",
  de: "de",
  es: "es",
  pt: "pt-PT",
  sv: "sv",
  cs: "cs",
  pl: "pl",
  tr: "tr",
  ru: "ru",
  uk: "uk",
  ja: "ja",
  ko: "ko",
  zh: "zh-CN",
};

export function toAlignmentLocale(language: string): string {
  return SYNTHESIS_TO_ALIGNMENT_LANGUAGE[language] ?? "en-US";
}

/**
 * VocaSync API client.
 *
 * Implements the two-POST audio pipeline: synthesis (POST /synthesis) then
 * an explicit alignment job (presign -> S3 upload -> POST /alignment) with a
 * client-supplied transcript, so alignment word indices line up with the
 * rehype plugin's `data-i` token stream. `align=true` auto-chaining is
 * deprecated and no longer used.
 */
export class VocaSyncClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(apiKey: string, baseUrl = "https://vocasync.io/api/v1") {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  /** Make an authenticated JSON API request. */
  private async request<T>(method: string, endpoint: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new VocaSyncAPIError(
        `API request failed: ${response.status} ${response.statusText}`,
        response.status,
        errorBody
      );
    }

    return response.json() as Promise<T>;
  }

  /** Stream URL (without publishable key) for an artifact. */
  streamUrl(projectUuid: string, kind: "synthesis" | "alignment"): string {
    return `${this.baseUrl}/stream/${projectUuid}/${kind}`;
  }

  /**
   * Create a synthesis project. No `align` flag — alignment is run as a
   * separate explicit job (see runAlignment).
   */
  async synthesize(params: {
    name: string;
    text: string;
    voice: string;
    quality: "sd" | "hd";
    language: string;
    outputFormat: string;
  }): Promise<SynthesisResponse> {
    const formData = new FormData();
    formData.append("textType", "text");
    formData.append("text", params.text);
    formData.append("voice", params.voice);
    formData.append("quality", params.quality);
    formData.append("language", params.language);
    formData.append("outputFormat", params.outputFormat);
    formData.append("projectName", params.name);

    const response = await fetch(`${this.baseUrl}/synthesis`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: formData,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new VocaSyncAPIError(
        `Synthesis request failed: ${response.status} ${response.statusText}`,
        response.status,
        errorBody
      );
    }

    return (await response.json()) as SynthesisResponse;
  }

  /** Fetch a single project's status (GET /projects/{uuid}). */
  async getProject(projectUuid: string): Promise<ProjectStatus> {
    const project = await this.request<ProjectResponse>("GET", `/projects/${projectUuid}`);
    return {
      uuid: project.projectUuid,
      name: project.name ?? "",
      projectType: project.projectType,
      status: project.status,
      durationSeconds: project.audioFileDurationSeconds ?? undefined,
      error: project.error ?? undefined,
    };
  }

  /**
   * Poll a project until it completes or fails. Throws on failure (with the
   * server `error`) or timeout.
   */
  async pollUntilComplete(
    projectUuid: string,
    options: {
      maxAttempts?: number;
      intervalMs?: number;
      onProgress?: (status: ProjectStatus) => void;
    } = {}
  ): Promise<ProjectStatus> {
    const { maxAttempts = 180, intervalMs = 5000, onProgress } = options;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const status = await this.getProject(projectUuid);
      onProgress?.(status);

      if (status.status === "completed") return status;
      if (status.status === "failed") {
        throw new VocaSyncAPIError(
          `${status.projectType} failed: ${status.error || "Unknown error"}`,
          500
        );
      }
      await sleep(intervalMs);
    }

    throw new VocaSyncAPIError("Polling timeout — job did not complete in time", 408);
  }

  /**
   * Create a publishable key for a completed project (enables public stream
   * access). The full key is only returned once.
   */
  async createPublishableKey(projectUuid: string): Promise<string> {
    const response = await this.request<{ publishableKey: string }>(
      "POST",
      `/projects/${projectUuid}/publishable-key`
    );
    return response.publishableKey;
  }

  /** Download bytes from a stream URL (used to re-upload audio for alignment). */
  async downloadBytes(url: string): Promise<{ bytes: Uint8Array; contentType: string }> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new VocaSyncAPIError(`Failed to download ${url}: ${response.status}`, response.status);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") ?? "audio/mpeg";
    return { bytes, contentType };
  }

  /** Request presigned upload URLs for the alignment audio + transcript. */
  async presignAlignment(params: {
    audioName: string;
    audioType: string;
    audioSize: number;
    transcriptSize: number;
    language: string;
  }): Promise<AlignmentPresignResponse> {
    return this.request<AlignmentPresignResponse>("POST", "/alignment/presign", {
      audioFile: { name: params.audioName, type: params.audioType, size: params.audioSize },
      transcriptFile: { name: "transcript.txt", type: "text/plain", size: params.transcriptSize },
      language: params.language,
    });
  }

  /** PUT bytes to a presigned upload URL. */
  async uploadToPresigned(
    uploadUrl: string,
    bytes: Uint8Array,
    contentType: string
  ): Promise<void> {
    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      // Uint8Array is a valid fetch body at runtime; the DOM lib's BodyInit
      // type is narrower than undici/bun's, hence the cast.
      body: bytes as unknown as BodyInit,
    });
    if (!response.ok) {
      throw new VocaSyncAPIError(
        `S3 upload failed: ${response.status} ${response.statusText}`,
        response.status
      );
    }
  }

  /** Submit an alignment job for pre-uploaded audio + transcript (JSON mode). */
  async submitAlignment(params: {
    projectUuid: string;
    audioFileKey: string;
    transcriptFileKey: string;
    audioFileSizeBytes: number;
    transcriptFileSizeBytes: number;
    language: string;
    projectName: string;
  }): Promise<AlignmentSubmitResponse> {
    return this.request<AlignmentSubmitResponse>("POST", "/alignment", {
      projectUuid: params.projectUuid,
      audioFileKey: params.audioFileKey,
      transcriptFileKey: params.transcriptFileKey,
      audioFileSizeBytes: params.audioFileSizeBytes,
      transcriptFileSizeBytes: params.transcriptFileSizeBytes,
      language: params.language,
      projectName: params.projectName,
    });
  }

  /** Fetch the alignment word timings from a completed alignment project. */
  async fetchAlignmentWords(
    alignmentStreamUrl: string
  ): Promise<{ words: AlignedWord[]; duration: number }> {
    const response = await fetch(alignmentStreamUrl);
    if (!response.ok) {
      throw new VocaSyncAPIError(`Failed to fetch alignment: ${response.status}`, response.status);
    }
    const data = (await response.json()) as { words?: AlignedWord[]; duration?: number };
    return { words: data.words ?? [], duration: data.duration ?? 0 };
  }

  /** Validate the API key and return the prepaid balance in cents. */
  async validateApiKey(): Promise<{ valid: boolean; balanceCents?: number }> {
    try {
      const response = await this.request<{ plan?: { balanceCents?: number } }>("GET", "/me");
      return { valid: true, balanceCents: response.plan?.balanceCents };
    } catch (error) {
      if (error instanceof VocaSyncAPIError && error.statusCode === 401) {
        return { valid: false };
      }
      throw error;
    }
  }
}

/** Append a publishable key to a stream URL. */
export function withPublishableKey(url: string, publishableKey: string): string {
  const u = new URL(url);
  u.searchParams.set("pk", publishableKey);
  return u.toString();
}

/** Custom error class for VocaSync API errors. */
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Create a VocaSync client from configuration (reads VOCASYNC_API_KEY). */
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
