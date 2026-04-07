import type { Root } from "mdast";
import { visit } from "unist-util-visit";
import type { VFile } from "vfile";

export type MathSpeechEntry = {
  latex: string;
  display: boolean;
};

/**
 * Remark plugin that collects all math expressions from markdown.
 * Must run BEFORE remark-math.
 * Stores entries in file.data.mathSpeech for rehypeMathSpeech to consume.
 */
export default function remarkMathSpeechCollector() {
  return function transformer(tree: Root, file: VFile) {
    const entries: MathSpeechEntry[] = [];
    visit(tree, (node) => {
      if (node.type !== "math" && node.type !== "inlineMath") return;
      const latex = String("value" in node ? (node.value ?? "") : "").trim();
      if (!latex) return;
      entries.push({
        latex,
        display: node.type === "math",
      });
    });
    if (entries.length) {
      file.data.mathSpeech = entries;
    }
  };
}
