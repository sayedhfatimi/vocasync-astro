import type { Content, Emphasis, Heading, Root, Strong, Text } from "mdast";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";
import type { MathConfig } from "../config/index.js";
import { speakLatex } from "../lib/latex-to-speech/speak.js";
import type { ContentItem, SpeechDocument } from "../types/index.js";
import { buildSpeechtextPair } from "./spoken-form.js";

interface BuildOptions {
  math?: MathConfig;
}

/**
 * Build a speech document from markdown content.
 *
 * Produces plain text from the SAME visible tokens the rehype word-wrapper
 * sees — no phantom tokens (no "Quote:", "Image:", "[Code in X]", inline
 * code), and code blocks / images are skipped exactly as rehype skips
 * `pre`/`code`/`img`. This keeps the alignment transcript
 * (`normalisedSpeechtext`) token-for-token with the rehype `data-i` stream.
 *
 * Headings keep a leading "# " marker so the synthesis backend chunks at
 * heading boundaries; `stripForAlignment` removes it, so it never becomes an
 * alignment token. Math expressions contribute their `speakLatex` output at
 * their reading position (the same string the rehype math handler counts).
 */
export async function buildSpeechDocument(
  item: ContentItem,
  options: BuildOptions = {}
): Promise<SpeechDocument> {
  const mathConfig = options.math ?? { enabled: false, style: "clearspeak" };
  const style = mathConfig.style || "clearspeak";

  const processor = unified().use(remarkParse).use(remarkMath);
  const tree = processor.parse(item.content) as Root;

  const textParts: (string | Promise<string>)[] = [];
  // Collect math spoken forms keyed by `${'d'|'i'}:${latex}` so the rehype
  // plugin can reuse them without running math-to-speech in the Vite build.
  const mathKeys: string[] = [];
  const mathPromises: Promise<string>[] = [];

  function recordMath(latex: string, display: boolean): Promise<string> {
    const p = speakLatex(latex, display, style);
    mathKeys.push(`${display ? "d" : "i"}:${latex.trim()}`);
    mathPromises.push(p);
    return p;
  }

  function processChildren(node: { children: Content[] }): void {
    for (const child of node.children) {
      processNode(child);
    }
  }

  function processNode(node: Content | Root): void {
    switch (node.type) {
      case "text": {
        textParts.push((node as Text).value);
        break;
      }

      // Inline code and code blocks are skipped by the rehype word-wrapper
      // (pre/code in its skip set), so they must not contribute speech tokens.
      case "inlineCode":
      case "code": {
        break;
      }

      case "heading": {
        const heading = node as Heading;
        // Single "#" chunk marker for all heading levels (synthesis backend
        // expects it). Removed by stripForAlignment, so not an alignment token.
        textParts.push("\n# ");
        processChildren(heading);
        textParts.push("\n");
        break;
      }

      case "paragraph": {
        processChildren(node as { children: Content[] });
        textParts.push("\n");
        break;
      }

      case "emphasis": {
        processChildren(node as Emphasis);
        break;
      }

      case "strong": {
        processChildren(node as Strong);
        break;
      }

      case "link": {
        // Read link text only, not the URL (matches rehype: <a> text is walked).
        processChildren(node as { children: Content[] });
        break;
      }

      // Images are skipped by the rehype word-wrapper (img in its skip set);
      // alt text is an attribute, not a rendered text node — emit nothing.
      case "image": {
        break;
      }

      case "list": {
        processChildren(node as { children: Content[] });
        break;
      }

      case "listItem": {
        processChildren(node as { children: Content[] });
        // Sentence break for TTS prosody; punctuation only, not an alignment token.
        textParts.push(". ");
        break;
      }

      case "blockquote": {
        // Just the quote's text — no "Quote:"/"End quote." wrappers (those
        // words have no rendered-DOM counterpart and would desync data-i).
        processChildren(node as { children: Content[] });
        textParts.push("\n");
        break;
      }

      case "math": {
        const mathNode = node as { value: string };
        if (mathConfig.enabled) {
          textParts.push(recordMath(mathNode.value, true));
        }
        break;
      }

      case "inlineMath": {
        const inlineMathNode = node as { value: string };
        if (mathConfig.enabled) {
          textParts.push(recordMath(inlineMathNode.value, false));
        }
        break;
      }

      case "thematicBreak": {
        textParts.push("\n\n");
        break;
      }

      case "root": {
        processChildren(node as Root);
        break;
      }

      default: {
        const maybeParent = node as { children?: Content[] };
        if (maybeParent.children) processChildren(maybeParent as { children: Content[] });
      }
    }
  }

  processNode(tree);

  // Resolve async math conversions.
  const resolvedParts = await Promise.all(textParts);

  // Normalize whitespace. The title is intentionally excluded so the
  // alignment data matches the article body only.
  const plainText = resolvedParts
    .join(" ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n/g, "\n\n")
    .replace(/\s*\.\s*\./g, ".")
    .trim();

  const { speechtext, normalisedSpeechtext } = buildSpeechtextPair(plainText);

  // Map each math expression's latex key to its resolved spoken form.
  const resolvedMath = await Promise.all(mathPromises);
  const mathSpeech: Record<string, string> = {};
  for (let i = 0; i < mathKeys.length; i++) {
    mathSpeech[mathKeys[i]] = resolvedMath[i];
  }

  return {
    slug: item.slug,
    speechtext,
    normalisedSpeechtext,
    mathSpeech,
    source: item.filePath,
  };
}
