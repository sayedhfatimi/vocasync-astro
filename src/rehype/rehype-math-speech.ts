import type { Element, Parent, Root } from "hast";
import { visitParents } from "unist-util-visit-parents";
import type { VFile } from "vfile";
import type { MathSpeechEntry } from "./remark-math-speech.js";

const SR_SPEECH_CLASS = "vocasync-math-speech";

let latexToSpeech: ((exprs: string[], options?: Record<string, unknown>) => Promise<string[]>) | null = null;
let latexToSpeechLoadAttempted = false;

const latexSpeechCache = new Map<string, Promise<string>>();
let warnedLatexSpeechFailure = false;

interface RehypeMathSpeechOptions {
  /**
   * SRE domain style for math-to-speech conversion
   * @default "clearspeak"
   */
  style?: "clearspeak" | "mathspeak";
}

/**
 * Convert LaTeX to spoken text using speech-rule-engine and mathjax-full.
 */
async function speakLatex(
  value: string,
  style: string = "clearspeak"
): Promise<string> {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";

  // Lazy load our internal latex-to-speech module
  if (!latexToSpeechLoadAttempted) {
    latexToSpeechLoadAttempted = true;
    try {
      const mod = await import("../lib/latex-to-speech/index.js");
      latexToSpeech = mod.latexToSpeech || mod.default;
    } catch (e) {
      console.warn(
        "[vocasync] Math-to-speech initialization failed. Install optional dependencies:",
        "\n  npm install speech-rule-engine mathjax-full"
      );
    }
  }

  if (!latexToSpeech) {
    return trimmed; // Fallback to raw latex if library not available
  }

  const cacheKey = `${style}:${trimmed}`;
  if (!latexSpeechCache.has(cacheKey)) {
    const pending = (async () => {
      try {
        const result = await latexToSpeech!([trimmed], {
          domain: style,
          style: "default",
          locale: "en",
          modality: "speech",
        });
        const spoken = Array.isArray(result) ? result[0] : String(result ?? "");
        return normalizeWhitespace(spoken);
      } catch (error) {
        if (!warnedLatexSpeechFailure) {
          console.warn(
            "[vocasync] Failed to convert LaTeX to speech:",
            error instanceof Error ? error.message : error
          );
          warnedLatexSpeechFailure = true;
        }
        return normalizeWhitespace(trimmed);
      }
    })();
    latexSpeechCache.set(cacheKey, pending);
  }
  return latexSpeechCache.get(cacheKey)!;
}

function normalizeWhitespace(value = ""): string {
  return value.replace(/\r/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Rehype plugin that injects hidden spoken text next to math elements.
 * This allows rehypeAudioWords to wrap the spoken words with timing data.
 * 
 * Must run AFTER rehype-katex or rehype-mathjax, and BEFORE rehypeAudioWords.
 */
export default function rehypeMathSpeech(options: RehypeMathSpeechOptions = {}) {
  const { style = "clearspeak" } = options;

  return async function transformer(tree: Root, file: VFile) {
    const mathSpeech = file.data.mathSpeech as MathSpeechEntry[] | undefined;
    if (!mathSpeech?.length) return;

    // Find all MathJax/KaTeX container elements
    const occurrences: Array<{ node: Element; parent: Parent }> = [];
    visitParents(tree, "element", (node, ancestors) => {
      // MathJax uses mjx-container, KaTeX uses .katex class
      const isMathJax = node.tagName === "mjx-container";
      const isKatex =
        node.tagName === "span" &&
        Array.isArray(node.properties?.className) &&
        (node.properties.className as string[]).includes("katex");

      if (!isMathJax && !isKatex) return;

      const parent = ancestors[ancestors.length - 1] as Parent | undefined;
      if (!parent) return;
      occurrences.push({ node, parent });
    });

    if (!occurrences.length) return;

    let mathIndex = 0;
    for (const occurrence of occurrences) {
      if (mathIndex >= mathSpeech.length) break;
      const entry = mathSpeech[mathIndex];
      mathIndex += 1;
      const latex = entry.latex.trim();
      if (!latex) continue;

      const spoken = await speakLatex(latex, style);
      if (!spoken) continue;

      const parentChildren = occurrence.parent.children;
      const index = parentChildren.indexOf(occurrence.node);
      if (index === -1) continue;

      // Create a hidden span with the spoken text
      const speechNode: Element = {
        type: "element",
        tagName: "span",
        properties: {
          className: ["sr-only", SR_SPEECH_CLASS],
          "data-math-speech": entry.display ? "display" : "inline",
          "aria-hidden": "true",
        },
        children: [{ type: "text", value: spoken }],
      };

      // Insert the speech node right after the math element
      parentChildren.splice(index + 1, 0, speechNode);
    }
  };
}
