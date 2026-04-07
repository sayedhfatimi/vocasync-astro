import type { Element, Parent, Root } from "hast";
import { visitParents } from "unist-util-visit-parents";
import type { VFile } from "vfile";
import { speakLatex } from "../lib/latex-to-speech/speak.js";
import type { MathSpeechEntry } from "./remark-math-speech.js";

const SR_SPEECH_CLASS = "vocasync-math-speech";

interface RehypeMathSpeechOptions {
  /**
   * SRE domain style for math-to-speech conversion
   * @default "clearspeak"
   */
  style?: "clearspeak" | "mathspeak";
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

    if (mathSpeech.length !== occurrences.length) {
      console.warn(
        `[vocasync] Math speech mismatch: collected ${mathSpeech.length} expression(s) from markdown but found ${occurrences.length} rendered math element(s). Check that remark-math and rehype-katex/rehype-mathjax are both configured.`
      );
    }

    let mathIndex = 0;
    for (const occurrence of occurrences) {
      if (mathIndex >= mathSpeech.length) break;
      const entry = mathSpeech[mathIndex];
      mathIndex += 1;
      const latex = entry.latex.trim();
      if (!latex) continue;

      const spoken = await speakLatex(latex, entry.display, style);
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
