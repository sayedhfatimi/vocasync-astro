import type { Code, Content, Emphasis, Heading, InlineCode, Root, Strong, Text } from "mdast";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";
import type { MathConfig } from "../config/index.js";
import { speakLatex } from "../lib/latex-to-speech/speak.js";
import type { ContentItem, SpeechDocument } from "../types/index.js";
import { computeHash } from "./hash-manager.js";

/**
 * LaTeX to speech converter interface
 */
interface LaTeXConverter {
  convert(latex: string, display: boolean): Promise<string>;
}

/**
 * Create a LaTeX converter that delegates to the shared speakLatex module.
 */
function createLatexConverter(config: MathConfig): LaTeXConverter | null {
  if (!config.enabled) {
    return null;
  }

  const style = config.style || "clearspeak";

  return {
    convert(latex: string, display: boolean): Promise<string> {
      return speakLatex(latex, display, style);
    },
  };
}

/**
 * Options for building speech document
 */
interface BuildOptions {
  math?: MathConfig;
}

/**
 * Build a speech document from markdown content.
 * Converts markdown to plain text suitable for TTS synthesis.
 *
 * @param item - The content item to process
 * @param options - Build options including math configuration
 * @returns A speech document ready for synthesis
 */
export async function buildSpeechDocument(
  item: ContentItem,
  options: BuildOptions = {}
): Promise<SpeechDocument> {
  const mathConfig = options.math ?? { enabled: false, style: "clearspeak" };
  const latexConverter = createLatexConverter(mathConfig);

  // Parse markdown with math support
  const processor = unified().use(remarkParse).use(remarkMath);

  const tree = processor.parse(item.content) as Root;

  // Extract text from AST - can contain strings or promises
  const textParts: (string | Promise<string>)[] = [];

  function processNode(node: Content | Root): void {
    switch (node.type) {
      case "text": {
        const textNode = node as Text;
        textParts.push(textNode.value);
        break;
      }

      case "inlineCode": {
        const codeNode = node as InlineCode;
        // Skip short code, read longer code
        if (codeNode.value.length > 10) {
          textParts.push(codeNode.value);
        }
        break;
      }

      case "code": {
        const blockCode = node as Code;
        // Skip code blocks entirely for TTS
        // Could optionally add language hint: "Code block in {lang}"
        if (blockCode.lang) {
          textParts.push(`[Code in ${blockCode.lang}]`);
        }
        break;
      }

      case "heading": {
        const heading = node as Heading;
        // Add single # marker for synthesis chunking (backend expects single # for all heading levels)
        textParts.push("\n# ");
        // Process children
        for (const child of heading.children) {
          processNode(child as Content);
        }
        // Add newline after headings for separation
        textParts.push("\n");
        break;
      }

      case "paragraph": {
        const para = node as { children: Content[] };
        for (const child of para.children) {
          processNode(child);
        }
        // Paragraph break
        textParts.push("\n");
        break;
      }

      case "emphasis": {
        const em = node as Emphasis;
        for (const child of em.children) {
          processNode(child as Content);
        }
        break;
      }

      case "strong": {
        const strong = node as Strong;
        for (const child of strong.children) {
          processNode(child as Content);
        }
        break;
      }

      case "link": {
        const link = node as { children: Content[] };
        // Only read link text, not URL
        for (const child of link.children) {
          processNode(child);
        }
        break;
      }

      case "image": {
        const img = node as { alt?: string };
        // Read alt text
        if (img.alt) {
          textParts.push(`Image: ${img.alt}`);
        }
        break;
      }

      case "list": {
        const list = node as { children: Content[] };
        for (const child of list.children) {
          processNode(child);
        }
        break;
      }

      case "listItem": {
        const listItem = node as { children: Content[] };
        for (const child of listItem.children) {
          processNode(child);
        }
        textParts.push(". ");
        break;
      }

      case "blockquote": {
        const quote = node as { children: Content[] };
        textParts.push("Quote: ");
        for (const child of quote.children) {
          processNode(child);
        }
        textParts.push(" End quote.");
        break;
      }

      // Math nodes from remark-math
      case "math": {
        const mathNode = node as { value: string };
        if (latexConverter) {
          textParts.push(latexConverter.convert(mathNode.value, true));
        } else {
          textParts.push(`[Math: ${mathNode.value.slice(0, 30)}]`);
        }
        break;
      }

      case "inlineMath": {
        const inlineMathNode = node as { value: string };
        if (latexConverter) {
          textParts.push(latexConverter.convert(inlineMathNode.value, false));
        } else {
          textParts.push(inlineMathNode.value);
        }
        break;
      }

      case "thematicBreak": {
        textParts.push("\n\n");
        break;
      }

      // Handle container nodes with children
      case "root": {
        const root = node as Root;
        for (const child of root.children) {
          processNode(child);
        }
        break;
      }

      default: {
        // Try to process children if they exist
        const maybeParent = node as { children?: Content[] };
        if (maybeParent.children) {
          for (const child of maybeParent.children) {
            processNode(child);
          }
        }
      }
    }
  }

  processNode(tree);

  // Resolve all promises in textParts (for async math conversion)
  const resolvedParts = await Promise.all(textParts);

  // Clean up and normalize text
  const text = resolvedParts
    .join(" ")
    .replace(/\s+/g, " ") // Normalize whitespace
    .replace(/\n\s*\n/g, "\n\n") // Preserve paragraph breaks
    .replace(/\s*\.\s*\./g, ".") // Clean up double periods
    .trim();

  // Note: We intentionally do NOT include the title in the speech text.
  // The title is displayed visually and doesn't need to be in the audio.
  // This also ensures alignment data matches the article body content.

  // Compute hash for change detection
  const hash = computeHash(text);

  return {
    slug: item.slug,
    text,
    hash,
    source: item.filePath,
  };
}
