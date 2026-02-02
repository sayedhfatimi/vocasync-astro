import type { Root, Element, Text } from "hast";
import type { Plugin } from "unified";
import { visitParents } from "unist-util-visit-parents";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import type { AlignedWord, AudioMap } from "../types/index.js";

/**
 * Options for the rehype audio words plugin.
 */
export interface RehypeAudioWordsOptions {
  /**
   * Path to the audio map JSON file.
   * Can be absolute or relative to the project root.
   * @default ".vocasync/audio-map.json"
   */
  audioMapPath?: string;

  /**
   * CSS class prefix for generated elements.
   * @default "vocasync"
   */
  classPrefix?: string;

  /**
   * The name of the content collection folder to extract slugs from.
   * @default "articles"
   */
  collectionName?: string;
}

// Cache the loaded audio map to avoid re-reading on every file
let audioMapCache: AudioMap | null = null;
let audioMapCachePath: string | null = null;

// Cache for fetched alignment data per slug
const alignmentCache: Map<string, AlignedWord[]> = new Map();

function loadAudioMapSync(audioMapPath: string): AudioMap | null {
  // Use cache if same path
  if (audioMapCache && audioMapCachePath === audioMapPath) {
    return audioMapCache;
  }

  try {
    const absolutePath = resolve(process.cwd(), audioMapPath);
    const content = readFileSync(absolutePath, "utf-8");
    audioMapCache = JSON.parse(content) as AudioMap;
    audioMapCachePath = audioMapPath;
    return audioMapCache;
  } catch {
    // File doesn't exist or is invalid - return null
    return null;
  }
}

/**
 * Fetch alignment data from URL (synchronously using a worker thread approach).
 * Since rehype plugins must be synchronous, we use a sync HTTP request.
 */
function fetchAlignmentSync(alignmentUrl: string, slug: string): AlignedWord[] | null {
  // Check cache first
  if (alignmentCache.has(slug)) {
    return alignmentCache.get(slug) ?? null;
  }

  try {
    // Use sync-fetch or execSync to make a synchronous HTTP request
    // We'll use child_process.execSync with curl as a simple solution
    // Note: -L flag follows redirects (required for vocasync.io signed URLs)
    const result = execSync(`curl -sL "${alignmentUrl}"`, {
      encoding: "utf-8",
      timeout: 30000,
    });

    const data = JSON.parse(result);
    
    // The alignment response contains a words array
    const words = data.words as AlignedWord[] | undefined;
    if (words && Array.isArray(words)) {
      alignmentCache.set(slug, words);
      return words;
    }

    return null;
  } catch {
    // Failed to fetch - return null
    return null;
  }
}

/**
 * Rehype plugin that wraps words with timing spans for audio sync.
 *
 * For each text node in the document, this plugin:
 * 1. Tokenizes the text into words
 * 2. Matches words against alignment data
 * 3. Wraps matched words in <span> elements with data-start and data-end attributes
 *
 * @example
 * ```typescript
 * // astro.config.mjs
 * import { defineConfig } from "astro/config";
 * import { rehypeAudioWords } from "@vocasync/astro/rehype";
 *
 * export default defineConfig({
 *   markdown: {
 *     rehypePlugins: [
 *       [rehypeAudioWords, { collectionName: "articles" }]
 *     ]
 *   }
 * });
 * ```
 */
const rehypeAudioWords: Plugin<[RehypeAudioWordsOptions?], Root> = (options = {}) => {
  const {
    audioMapPath = ".vocasync/audio-map.json",
    classPrefix = "vocasync",
    collectionName = "articles"
  } = options;

  return (tree, file) => {
    // Load audio map (cached after first load)
    const audioMap = loadAudioMapSync(audioMapPath);
    if (!audioMap) {
      return; // No audio map available, skip processing
    }

    // Resolve slug from file path
    // Files are typically at paths like: /src/content/articles/hello-world.md
    const filePath = file.path ?? (Array.isArray(file.history) ? file.history[file.history.length - 1] : undefined);
    
    if (!filePath) {
      return; // No file path, skip processing
    }
    
    // Normalize path separators
    const normalizedPath = filePath.replace(/\\/g, "/");
    
    // Try to extract slug from collection path
    // Pattern: /src/content/{collectionName}/{slug}.md or .mdx
    const collectionPattern = new RegExp(`/content/${collectionName}/([^/]+)\\.(md|mdx)$`);
    const match = normalizedPath.match(collectionPattern);
    
    let slug: string | undefined;
    if (match) {
      slug = match[1];
    } else {
      // Fallback: just get the filename without extension
      const filenameMatch = normalizedPath.match(/\/([^/]+)\.(md|mdx)$/);
      if (filenameMatch) {
        slug = filenameMatch[1];
      }
    }

    if (!slug) {
      return; // No slug, skip processing
    }

    // Get alignment URL for this slug from audio map
    const entry = audioMap.entries[slug];
    if (!entry?.alignmentUrl) {
      return; // No alignment URL, skip
    }

    // Fetch alignment words from URL
    const words = fetchAlignmentSync(entry.alignmentUrl, slug);

    if (!words || words.length === 0) {
      return; // No alignment data, skip
    }

    // Track word index as we process text nodes
    let wordIndex = 0;

    // Process all text nodes in the document
    visitParents(tree, "text", (node, ancestors) => {
      const textNode = node as Text;
      const parent = ancestors[ancestors.length - 1] as Element;

      // Skip text in code blocks, scripts, styles
      if (isInNonTextualElement(ancestors)) {
        return;
      }

      // Tokenize and match words
      const result = processTextNode(textNode.value, words, wordIndex, classPrefix);

      if (result.nodes.length === 0 || result.nodes.length === 1) {
        return; // No changes needed
      }

      // Update word index
      wordIndex = result.nextWordIndex;

      // Replace text node with annotated nodes
      const parentChildren = parent.children;
      const nodeIndex = parentChildren.indexOf(node);

      if (nodeIndex !== -1) {
        parentChildren.splice(nodeIndex, 1, ...result.nodes);
      }
    });
  };
};

/**
 * Check if ancestors include non-textual elements (code, script, style, KaTeX).
 */
function isInNonTextualElement(ancestors: (Root | Element)[]): boolean {
  const nonTextualTags = new Set(["code", "pre", "script", "style", "svg", "math"]);
  const nonTextualClasses = new Set(["katex", "katex-mathml", "katex-html", "mjx-container"]);

  for (const ancestor of ancestors) {
    if ("tagName" in ancestor && nonTextualTags.has(ancestor.tagName)) {
      return true;
    }
    // Check for KaTeX/MathJax class names
    if ("properties" in ancestor && ancestor.properties?.className) {
      const classes = Array.isArray(ancestor.properties.className)
        ? ancestor.properties.className
        : [ancestor.properties.className];
      for (const cls of classes) {
        if (typeof cls === "string" && nonTextualClasses.has(cls)) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Process a text node and create annotated nodes.
 */
function processTextNode(
  text: string,
  words: AlignedWord[],
  startIndex: number,
  classPrefix: string
): {
  nodes: (Text | Element)[];
  nextWordIndex: number;
} {
  const nodes: (Text | Element)[] = [];
  let wordIndex = startIndex;
  let lastEnd = 0;

  // Regex to match words (similar to word boundaries)
  const wordPattern = /[\p{L}\p{N}'']+/gu;
  let match: RegExpExecArray | null;

  // biome-ignore lint/suspicious/noAssignInExpressions: <explanation>
  while ((match = wordPattern.exec(text)) !== null) {
    const word = match[0];
    const start = match.index;

    // Add text before this word
    if (start > lastEnd) {
      nodes.push({
        type: "text",
        value: text.slice(lastEnd, start),
      });
    }

    // Try to match with alignment data - look ahead if needed
    const normalizedWord = normalizeWord(word);
    let matchedIndex = -1;
    let matchedAligned: AlignedWord | null = null;

    // Search forward from current index to find matching word
    // Look ahead up to 10 words to handle minor ordering differences
    const maxLookahead = 10;
    for (let i = wordIndex; i < Math.min(wordIndex + maxLookahead, words.length); i++) {
      const candidate = words[i];
      if (normalizeWord(candidate.word) === normalizedWord) {
        matchedIndex = i;
        matchedAligned = candidate;
        break;
      }
    }

    if (matchedAligned && matchedIndex !== -1) {
      // Create annotated span
      nodes.push({
        type: "element",
        tagName: "span",
        properties: {
          className: [`${classPrefix}-word`],
          "data-word-index": matchedIndex,
          "data-start": matchedAligned.start.toFixed(3),
          "data-end": matchedAligned.end.toFixed(3),
        },
        children: [{ type: "text", value: word }],
      });
      wordIndex = matchedIndex + 1;
    } else {
      // No match, just add as text
      nodes.push({
        type: "text",
        value: word,
      });
    }

    lastEnd = start + word.length;
  }

  // Add remaining text
  if (lastEnd < text.length) {
    nodes.push({
      type: "text",
      value: text.slice(lastEnd),
    });
  }

  // Merge adjacent text nodes
  const merged: (Text | Element)[] = [];
  for (const node of nodes) {
    const last = merged[merged.length - 1];
    if (node.type === "text" && last?.type === "text") {
      last.value += node.value;
    } else {
      merged.push(node);
    }
  }

  return {
    nodes: merged,
    nextWordIndex: wordIndex,
  };
}

/**
 * Normalize a word for comparison (lowercase, remove punctuation).
 */
function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "")
    .trim();
}

export default rehypeAudioWords;
export { rehypeAudioWords };
