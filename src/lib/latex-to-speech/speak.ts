import { latexToSpeech } from "./index.js";

const cache = new Map<string, Promise<string>>();
let warnedFailure = false;

function normalizeWhitespace(value = ""): string {
  return value.replace(/\r/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Convert a LaTeX expression to spoken text.
 *
 * `latexToSpeech` is imported statically (it lazy-loads the optional
 * speech-rule-engine / mathjax-full deps internally), which is robust under
 * Astro's Vite SSR loader where a lazy `import()` of this module returned a
 * namespace without the expected named export.
 *
 * Falls back to the raw LaTeX if the math dependencies are unavailable or
 * conversion fails, so a build never crashes on math content.
 */
export async function speakLatex(
  latex: string,
  display: boolean,
  style = "clearspeak"
): Promise<string> {
  const trimmed = String(latex ?? "").trim();
  if (!trimmed) return "";

  const cacheKey = `${style}:${display}:${trimmed}`;
  if (!cache.has(cacheKey)) {
    const pending = (async () => {
      try {
        const result = await latexToSpeech([{ latex: trimmed, display }], {
          domain: style,
          style: "default",
          locale: "en",
          modality: "speech",
        });
        const spoken = Array.isArray(result) ? result[0] : String(result ?? "");
        return normalizeWhitespace(spoken) || trimmed;
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
