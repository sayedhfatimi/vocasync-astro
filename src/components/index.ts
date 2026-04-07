// Components are re-exported from the main components directory
// Import using: import { AudioPlayer } from "@vocasync/astro/components"

// Note: AudioPlayer.astro is copied to dist during build
// This file provides TypeScript types for the component

export interface AudioPlayerProps {
  /** Post slug to lookup audio in audio-map */
  slug: string;
  /** Audio entry data from audio-map.json */
  audioEntry?: {
    audioUrl: string;
    alignmentUrl?: string;
    words?: { word: string; start: number; end: number }[];
    duration?: number;
    publishableKey?: string;
  };
  /** Accessible label for the player */
  label?: string;
  /** Show placeholder when no audio available */
  showPlaceholder?: boolean;
  /** Additional CSS classes */
  class?: string;
  /** Selector for article body (for word highlighting) */
  articleSelector?: string;
  /** Enable floating mini player when main player scrolls out of view */
  enableMiniPlayer?: boolean;
  /** Enable word highlighting during playback */
  enableHighlighting?: boolean;
  /** Enable click on words to seek to that position */
  enableClickToSeek?: boolean;
  /** Number of trailing highlighted words */
  trailLength?: number;
}
