/**
 * Content item loaded from a collection
 */
export interface ContentItem {
  /** Unique slug identifier */
  slug: string;
  /** Original markdown/mdx content */
  content: string;
  /** Frontmatter data */
  frontmatter: Record<string, unknown>;
  /** Relative file path */
  filePath: string;
}

/**
 * Processed speech document ready for synthesis
 */
export interface SpeechDocument {
  /** Unique slug identifier */
  slug: string;
  /** Plain text for TTS synthesis */
  text: string;
  /** Content hash for change detection */
  hash: string;
  /** Source file path */
  source: string;
}

/**
 * Word alignment data from VocaSync API
 */
export interface AlignedWord {
  /** The word text */
  word: string;
  /** Start time in seconds */
  start: number;
  /** End time in seconds */
  end: number;
}

/**
 * Audio artifact entry in audio-map.json
 */
export interface AudioArtifact {
  /** Synthesis project UUID */
  projectUuid: string;
  /** Content hash used for change detection */
  contentHash: string;
  /** Total audio duration in seconds */
  duration: number;
  /** URL to stream audio (stable, non-expiring) */
  audioUrl: string;
  /** URL to fetch alignment JSON (stable, non-expiring) */
  alignmentUrl: string;
  /** Publishable key for streaming endpoint authentication */
  publishableKey?: string;
  /** When this artifact was created */
  createdAt: string;
  /** When this artifact was last updated */
  updatedAt: string;
}

/**
 * The audio-map.json file structure
 */
export interface AudioMap {
  /** Version of the audio-map schema */
  version: 1 | 2;
  /** When the map was last updated */
  updatedAt: string;
  /** Map of slug -> audio artifact */
  entries: Record<string, AudioArtifact>;
}

/**
 * VocaSync API synthesis request
 */
export interface SynthesisRequest {
  name: string;
  text: string;
  voice: string;
  speed?: number;
  quality?: "sd" | "hd";
  align?: boolean;
  language?: string;
}

/**
 * VocaSync API synthesis response
 */
export interface SynthesisResponse {
  projectUuid: string;
  estimatedCost: number;
}

/**
 * VocaSync API publishable key response
 */
export interface PublishableKeyResponse {
  publishableKey: string;
  projectUuid: string;
  prefix: string;
  createdAt: string;
}

/**
 * Job status from VocaSync API
 */
export type JobStatus = "pending" | "processing" | "completed" | "failed";

/**
 * API Artifact response
 */
export interface ArtifactResponse {
  id: string;
  artifactType: "alignment" | "synthesis";
  createdAt: number;
  alignmentFileKey?: string;
  alignmentFileSizeBytes?: number;
  srtFileKey?: string;
  srtFileSizeBytes?: number;
  vttFileKey?: string;
  vttFileSizeBytes?: number;
  synthesisFileKey?: string;
  synthesisFileSizeBytes?: number;
  synthesisFileName?: string;
}

/**
 * API Job response
 */
export interface JobResponse {
  id: string;
  status: JobStatus;
  createdAt: number;
  completedAt: number | null;
  error: string | null;
}

/**
 * Linked alignment project status
 */
export interface LinkedAlignmentStatus {
  projectUuid: string;
  status: JobStatus;
  error?: string | null;
}

/**
 * Project response from /projects/{uuid} endpoint
 */
export interface ProjectResponse {
  id: string;
  projectUuid: string;
  name: string | null;
  description: string | null;
  projectType: "alignment" | "synthesis";
  source: "web" | "api";
  language: string | null;
  status: JobStatus;
  characterCount: number | null;
  audioFileDurationSeconds: number | null;
  createdAt: number;
  completedAt: number | null;
  error: string | null;
  artifacts: ArtifactResponse[];
  latestJob?: JobResponse | null;
  linkedAlignment?: LinkedAlignmentStatus | null;
}

/**
 * Project status (internal representation)
 */
export interface ProjectStatus {
  uuid: string;
  name: string;
  status: JobStatus;
  synthesisJob?: {
    status: JobStatus;
    audioUrl?: string;
    duration?: number;
    error?: string;
  };
  alignmentJob?: {
    status: JobStatus;
    alignmentUrl?: string;
    error?: string;
  };
}

/**
 * Alignment data fetched from VocaSync
 */
export interface AlignmentData {
  words: AlignedWord[];
  duration: number;
}

/**
 * Sync status for a content item
 */
export type SyncStatus = "unchanged" | "new" | "updated" | "error";

/**
 * Result of syncing a single content item
 */
export interface SyncResult {
  slug: string;
  status: SyncStatus;
  projectUuid?: string;
  error?: string;
}

/**
 * Overall sync summary
 */
export interface SyncSummary {
  total: number;
  unchanged: number;
  synced: number;
  errors: number;
  results: SyncResult[];
}
