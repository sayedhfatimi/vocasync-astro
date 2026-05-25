import { describe, expect, test } from "bun:test";
import { buildSpeechDocument } from "../src/core/speech-builder.js";
import { spokenTokenCount } from "../src/core/spoken-form.js";
import type { ContentItem } from "../src/types/index.js";

// Same pattern the rehype plugin uses to wrap visible words.
const WORD_PATTERN = /[\p{L}\p{N}\p{Sc}%]+(?:['’][\p{L}\p{N}\p{Sc}%]+)*/gu;

function item(content: string): ContentItem {
  return { slug: "t", content, frontmatter: {}, filePath: "t.md" };
}

/** The data-i invariant: summing spokenTokenCount over the rehype word matches
 * of a visible string must equal the token count of the whole transcript. */
function rehypeTokenSum(visible: string): number {
  let sum = 0;
  for (const m of visible.matchAll(WORD_PATTERN)) sum += spokenTokenCount(m[0]);
  return sum;
}

function transcriptTokenCount(visible: string): number {
  return spokenTokenCount(visible);
}

describe("data-i token parity", () => {
  test.each([
    "In 1995 it cost $50 a 50% rise",
    "don't forget well-known facts",
    "plain prose with no numbers at all",
    "the price was $1000 down from $2000",
  ])("per-word sum equals whole-transcript count for %p", (visible) => {
    expect(rehypeTokenSum(visible)).toBe(transcriptTokenCount(visible));
  });
});

describe("buildSpeechDocument drops phantom tokens", () => {
  test("blockquote contributes only its text (no Quote: wrapper)", async () => {
    const doc = await buildSpeechDocument(item("> Hello world"));
    expect(doc.normalisedSpeechtext).toBe("hello world");
  });

  test("code blocks are skipped", async () => {
    const doc = await buildSpeechDocument(item("```js\nconst x = 1;\n```\n\nAfter."));
    expect(doc.normalisedSpeechtext).toBe("after");
  });

  test("inline code is skipped", async () => {
    const doc = await buildSpeechDocument(item("Use `someVeryLongInlineCode()` here."));
    expect(doc.normalisedSpeechtext).toBe("use here");
  });

  test("image alt text is not narrated", async () => {
    const doc = await buildSpeechDocument(item("![a cat photo](/cat.png)\n\nText."));
    expect(doc.normalisedSpeechtext).toBe("text");
  });

  test("numbers, currency and percent expand consistently", async () => {
    const doc = await buildSpeechDocument(item("It cost $50 (50% off)."));
    expect(doc.normalisedSpeechtext).toBe("it cost fifty dollar fifty percent off");
    expect(doc.speechtext).toBe("It cost fifty dollar (fifty percent off).");
  });

  test("headings contribute words but not the # marker", async () => {
    const doc = await buildSpeechDocument(item("# Big Title\n\nBody here."));
    expect(doc.normalisedSpeechtext).toBe("big title body here");
  });
});
