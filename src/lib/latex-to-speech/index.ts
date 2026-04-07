/**
 * LaTeX to Speech conversion using speech-rule-engine and mathjax-full.
 *
 * This module provides the same interface as the vendored latex-to-speech package
 * but works with the optional peer dependencies instead of bundling MathJax.
 */

// biome-ignore lint/suspicious/noExplicitAny: speech-rule-engine is an optional peer dep with no bundled types
let SRE: any = null;
let tex2mml: ((latex: string, display: boolean) => string) | null = null;
let lastEngineKey = "";
let initPromise: Promise<boolean> | null = null;

/**
 * Initialize the speech-rule-engine and MathJax tex2mml converter.
 * Returns true if successful, false if dependencies are not available.
 */
async function init(): Promise<boolean> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // Dynamically import speech-rule-engine
      SRE = await import("speech-rule-engine");
    } catch {
      console.warn("[vocasync] speech-rule-engine not installed. Math-to-speech disabled.");
      return false;
    }

    try {
      // Dynamically import mathjax-full components for tex2mml
      // @ts-expect-error - mathjax-full is an optional peer dependency
      const { TeX } = await import("mathjax-full/js/input/tex.js");
      // @ts-expect-error - mathjax-full is an optional peer dependency
      const { HTMLDocument } = await import("mathjax-full/js/handlers/html/HTMLDocument.js");
      // @ts-expect-error - mathjax-full is an optional peer dependency
      const { liteAdaptor } = await import("mathjax-full/js/adaptors/liteAdaptor.js");
      const { SerializedMmlVisitor } = await import(
        // @ts-expect-error - mathjax-full is an optional peer dependency
        "mathjax-full/js/core/MmlTree/SerializedMmlVisitor.js"
      );
      // @ts-expect-error - mathjax-full is an optional peer dependency
      const { AllPackages } = await import("mathjax-full/js/input/tex/AllPackages.js");

      // Filter out problematic packages
      const packages = AllPackages.filter((p: string) => p !== "bussproofs");

      // Create TeX input jax with all packages
      const texInput = new TeX({ packages });

      // Create a minimal HTML document for conversion
      const adaptor = liteAdaptor();
      const doc = new HTMLDocument("", adaptor, { InputJax: texInput });

      // Create a visitor to serialize to MathML
      const visitor = new SerializedMmlVisitor();

      // Create the tex2mml function — display flag controls MathML output
      tex2mml = (latex: string, display: boolean): string => {
        const node = doc.convert(latex, { display });
        return visitor.visitTree(node);
      };

      return true;
    } catch {
      console.warn("[vocasync] mathjax-full not installed. Math-to-speech disabled.");
      console.warn("[vocasync] Install with: npm install mathjax-full speech-rule-engine");
      return false;
    }
  })();

  return initPromise;
}

/**
 * Options for speech-rule-engine
 */
export interface SREOptions {
  locale?: string;
  domain?: string;
  style?: string;
  modality?: string;
  speech?: string;
}

/**
 * A single LaTeX expression with its display context.
 */
export interface LaTeXExpression {
  latex: string;
  display: boolean;
}

/**
 * Convert an array of LaTeX expressions to speech.
 *
 * @param exprs - Array of LaTeX expressions (with display flag) to convert
 * @param options - SRE configuration options
 * @returns Promise resolving to array of speech strings
 */
export async function latexToSpeech(
  exprs: LaTeXExpression[],
  options: SREOptions = {}
): Promise<string[]> {
  const available = await init();

  if (!available || !SRE || !tex2mml) {
    // Return empty descriptions when dependencies not available
    return exprs.map(() => "");
  }

  // Reconfigure the engine when options change
  const engineKey = `${options.locale || "en"}:${options.domain || "mathspeak"}:${options.style || "default"}`;
  if (engineKey !== lastEngineKey) {
    await SRE.setupEngine({
      locale: options.locale || "en",
      domain: options.domain || "mathspeak",
      style: options.style || "default",
      modality: options.modality || "speech",
      speech: options.speech || "deep",
    });
    lastEngineKey = engineKey;
  }

  // Convert each expression
  return exprs.map(({ latex, display }) => {
    try {
      const mml = tex2mml!(latex, display);
      return SRE!.toSpeech(mml);
    } catch {
      console.warn(`[vocasync] Failed to convert LaTeX to speech: ${latex}`);
      return "";
    }
  });
}

export default latexToSpeech;
