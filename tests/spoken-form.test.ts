import { describe, expect, test } from "bun:test";
import {
  buildSpeechtextPair,
  expandSpokenForms,
  spokenTokenCount,
  stripForAlignment,
} from "../src/core/spoken-form.js";

describe("expandSpokenForms", () => {
  test("expands currency before a number", () => {
    expect(expandSpokenForms("$50")).toBe("fifty dollar");
  });

  test("expands percentages", () => {
    expect(expandSpokenForms("50%")).toBe("fifty percent");
  });

  test("expands multi-scale integers", () => {
    expect(expandSpokenForms("1995")).toBe("one thousand nine hundred ninety five");
  });

  test("strips thousands separators then expands", () => {
    expect(expandSpokenForms("1,000")).toBe("one thousand");
  });

  test("expands decimals digit-by-digit after the point", () => {
    expect(expandSpokenForms("3.14")).toBe("three point one four");
  });

  test("leaves plain prose untouched", () => {
    expect(expandSpokenForms("Hello, world.")).toBe("Hello, world.");
  });
});

describe("stripForAlignment", () => {
  test("lowercases and drops punctuation", () => {
    expect(stripForAlignment("Hello, World!")).toBe("hello world");
  });

  test("preserves contractions", () => {
    expect(stripForAlignment("Don't stop")).toBe("don't stop");
  });

  test("splits intra-word hyphens", () => {
    expect(stripForAlignment("well-known")).toBe("well known");
  });

  test("drops combining diacritics", () => {
    expect(stripForAlignment("café")).toBe("cafe");
  });

  test("removes urls and emails", () => {
    expect(stripForAlignment("see https://x.io or a@b.com now")).toBe("see or now");
  });
});

describe("spokenTokenCount", () => {
  test.each([
    ["word", 1],
    ["$50", 2],
    ["1995", 6],
    ["50%", 2],
    ["don't", 1],
    ["well-known", 2],
    ["", 0],
    ["...", 0],
  ])("spokenTokenCount(%p) === %p", (input, expected) => {
    expect(spokenTokenCount(input)).toBe(expected);
  });
});

describe("buildSpeechtextPair", () => {
  test("derives both forms from one input", () => {
    const { speechtext, normalisedSpeechtext } = buildSpeechtextPair("I paid $50 (cash).");
    expect(speechtext).toBe("I paid fifty dollar (cash).");
    expect(normalisedSpeechtext).toBe("i paid fifty dollar cash");
  });
});
