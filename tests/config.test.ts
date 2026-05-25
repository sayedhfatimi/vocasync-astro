import { describe, expect, test } from "bun:test";
import { FormatSchema, LanguageSchema, VoiceSchema, validateConfig } from "../src/config/index.js";

describe("config schemas", () => {
  test("accepts all 9 platform voices", () => {
    const voices = ["alloy", "ash", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer"];
    for (const v of voices) expect(VoiceSchema.safeParse(v).success).toBe(true);
    expect(voices).toHaveLength(9);
  });

  test("rejects unknown voices", () => {
    expect(VoiceSchema.safeParse("verse").success).toBe(false);
  });

  test("accepts all 5 output formats incl wav", () => {
    for (const f of ["mp3", "aac", "opus", "flac", "wav"]) {
      expect(FormatSchema.safeParse(f).success).toBe(true);
    }
    expect(FormatSchema.safeParse("ogg").success).toBe(false);
  });

  test("accepts the 14 alignment-supported languages, rejects others", () => {
    const langs = [
      "zh",
      "cs",
      "en",
      "fr",
      "de",
      "ja",
      "ko",
      "pl",
      "pt",
      "ru",
      "es",
      "sv",
      "tr",
      "uk",
    ];
    for (const l of langs) expect(LanguageSchema.safeParse(l).success).toBe(true);
    expect(langs).toHaveLength(14);
    expect(LanguageSchema.safeParse("hi").success).toBe(false);
  });

  test("validateConfig fills defaults", () => {
    const config = validateConfig({ collection: { name: "blog", path: "./src/content/blog" } });
    expect(config.synthesis.voice).toBe("onyx");
    expect(config.synthesis.format).toBe("mp3");
    expect(config.language).toBe("en");
  });
});
