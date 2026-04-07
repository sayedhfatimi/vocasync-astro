import type { LaTeXExpression, SREOptions } from "./index.js";

let latexToSpeech: ((exprs: LaTeXExpression[], options?: SREOptions) => Promise<string[]>) | null =
  null;
let loadAttempted = false;
let warnedFailure = false;

const cache = new Map<string, Promise<string>>();

function normalizeWhitespace(value = ""): string {
  return value.replace(/\r/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Lazily load the latex-to-speech module.
 * Returns false if optional peer dependencies are not installed.
 */
async function ensureLoaded(): Promise<boolean> {
  if (loadAttempted) return latexToSpeech !== null;
  loadAttempted = true;
  try {
    const mod = await import("./index.js");
    latexToSpeech = mod.latexToSpeech || mod.default;
    return latexToSpeech !== null;
  } catch {
    console.warn(
      "[vocasync] Math-to-speech initialization failed. Install optional dependencies:",
      "\n  npm install speech-rule-engine mathjax-full"
    );
    return false;
  }
}

/**
 * Convert a LaTeX expression to spoken text.
 *
 * Handles lazy loading, caching, normalization, and error recovery.
 * Cache key includes style and display mode for correctness.
 */
export async function speakLatex(
  latex: string,
  display: boolean,
  style = "clearspeak"
): Promise<string> {
  const trimmed = String(latex ?? "").trim();
  if (!trimmed) return "";

  if (!(await ensureLoaded())) {
    return trimmed; // Fallback to raw LaTeX
  }

  const cacheKey = `${style}:${display}:${trimmed}`;
  if (!cache.has(cacheKey)) {
    const pending = (async () => {
      try {
        const result = await latexToSpeech!([{ latex: trimmed, display }], {
          domain: style,
          style: "default",
          locale: "en",
          modality: "speech",
        });
        const spoken = Array.isArray(result) ? result[0] : String(result ?? "");
        return normalizeWhitespace(spoken);
      } catch (error) {
        if (!warnedFailure) {
          console.warn(
            "[vocasync] Failed to convert LaTeX to speech:",
            error instanceof Error ? error.message : error
          );
          warnedFailure = true;
        }
        return normalizeWhitespace(trimmed);
      }
    })();
    cache.set(cacheKey, pending);
  }
  return cache.get(cacheKey)!;
}
