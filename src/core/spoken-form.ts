/**
 * Spoken-form normalization primitives.
 *
 * Ported from the Valeon blog's audio pipeline so the plugin's
 * build-time tokenization reproduces VocaSync's alignment token stream
 * exactly. Two transforms:
 *
 *   expandSpokenForms(text)  — expands currencies, numbers, percentages
 *                              into spoken word equivalents. Preserves
 *                              punctuation/casing so it reads naturally
 *                              for TTS. This is the `speechtext` POSTed
 *                              to synthesis.
 *
 *   stripForAlignment(text)  — derives the alignment-friendly form:
 *                              lowercase, punctuation removed, whitespace
 *                              collapsed, contractions preserved. This is
 *                              the `normalisedSpeechtext` POSTed as the
 *                              alignment transcript AND the basis for the
 *                              rehype plugin's `data-i`/`data-n` indices.
 *
 * Because the alignment transcript IS `stripForAlignment(expandSpokenForms(text))`,
 * the worker's own normalizer is a no-op over it and word indices line up
 * token-for-token with the rehype output.
 */

const CURRENCY_SYMBOL_WORDS: Record<string, string> = {
  "£": "pound",
  $: "dollar",
  "€": "euro",
  "¥": "yen",
  "₹": "rupee",
  "₽": "ruble",
  "₩": "won",
  "₪": "shekel",
  "₺": "lira",
  "฿": "baht",
  "₫": "dong",
  "₴": "hryvnia",
  "₦": "naira",
  "₱": "peso",
  "₲": "guarani",
  "₡": "colon",
  "₭": "kip",
  "₮": "tugrik",
  "₿": "bitcoin",
  "₣": "franc",
  "¢": "cent",
  "₤": "lira",
};

const CURRENCY_SYMBOL_LIST = Object.keys(CURRENCY_SYMBOL_WORDS);
const CURRENCY_SYMBOL_CLASS = CURRENCY_SYMBOL_LIST.join("");
const CURRENCY_SYMBOL_RANGE = `[${CURRENCY_SYMBOL_CLASS}]`;
const CURRENCY_SYMBOL_BEFORE_NUMBER_REGEX = new RegExp(
  `(${CURRENCY_SYMBOL_RANGE})\\s*([0-9]+(?:[.,][0-9]+)*)`,
  "gu"
);
const CURRENCY_SYMBOL_AFTER_NUMBER_REGEX = new RegExp(
  `([0-9]+(?:[.,][0-9]+)*)\\s*(${CURRENCY_SYMBOL_RANGE})`,
  "gu"
);
const CURRENCY_SYMBOL_REGEX = new RegExp(CURRENCY_SYMBOL_RANGE, "gu");

const DIGIT_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
];

const SMALL_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];

const TENS_WORDS = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
];

const SCALE_WORDS = [
  "",
  "thousand",
  "million",
  "billion",
  "trillion",
  "quadrillion",
  "quintillion",
  "sextillion",
];

function threeDigitWords(value: number): string {
  const parts: string[] = [];
  let v = value;
  if (v >= 100) {
    parts.push(SMALL_WORDS[Math.floor(v / 100)]);
    parts.push("hundred");
    v %= 100;
  }
  if (v >= 20) {
    parts.push(TENS_WORDS[Math.floor(v / 10)]);
    v %= 10;
    if (v > 0) parts.push(SMALL_WORDS[v]);
  } else if (v > 0 || parts.length === 0) {
    parts.push(SMALL_WORDS[v]);
  }
  return parts.join(" ").trim();
}

const BIG_ZERO = BigInt(0);
const BIG_THOUSAND = BigInt(1000);

function integerToWords(value: bigint): string {
  if (value === BIG_ZERO) return "zero";
  const parts: string[] = [];
  let remaining = value;
  let scale = 0;
  while (remaining > BIG_ZERO) {
    const chunk = Number(remaining % BIG_THOUSAND);
    if (chunk > 0) {
      const words = threeDigitWords(chunk);
      const scaleWord = SCALE_WORDS[scale];
      parts.unshift(scaleWord ? `${words} ${scaleWord}`.trim() : words);
    }
    remaining /= BIG_THOUSAND;
    scale += 1;
  }
  return parts.join(" ").trim();
}

function expandNumberToken(token: string): string {
  let working = token;
  const result: string[] = [];
  let negative = false;
  if (working.startsWith("-")) {
    negative = true;
    working = working.slice(1);
  }
  if (!working) working = "0";
  const [intPart, decPart] = working.split(".");
  const integerValue = intPart ? BigInt(intPart) : BIG_ZERO;
  const integerWords = integerToWords(integerValue);
  if (negative) result.push("minus");
  result.push(integerWords);
  if (decPart) {
    result.push("point");
    for (const digit of decPart) {
      const value = Number(digit);
      if (!Number.isNaN(value) && value >= 0 && value <= 9) {
        result.push(DIGIT_WORDS[value]);
      }
    }
  }
  return result.join(" ");
}

function expandNumbers(input: string): string {
  return input.replace(/-?\d+(\.\d+)?/g, expandNumberToken);
}

function expandCurrencySymbols(input: string): string {
  let text = input.replace(CURRENCY_SYMBOL_BEFORE_NUMBER_REGEX, (_, symbol, digits) => {
    const word = CURRENCY_SYMBOL_WORDS[symbol];
    return word ? `${digits} ${word}` : `${symbol}${digits}`;
  });
  text = text.replace(CURRENCY_SYMBOL_AFTER_NUMBER_REGEX, (_, digits, symbol) => {
    const word = CURRENCY_SYMBOL_WORDS[symbol];
    return word ? `${digits} ${word}` : `${digits}${symbol}`;
  });
  return text.replace(CURRENCY_SYMBOL_REGEX, (symbol) => {
    const word = CURRENCY_SYMBOL_WORDS[symbol];
    return word ? ` ${word} ` : " ";
  });
}

function expandPercents(input: string): string {
  // Match number-followed-by-% (with optional space). "50%" -> "50 percent".
  // Runs before number expansion so the digits still parse cleanly.
  return input.replace(/([0-9]+(?:\.[0-9]+)?)\s*%/g, "$1 percent");
}

/**
 * Expand currency symbols, numbers, and percentages into their spoken
 * word forms. Preserves punctuation and surrounding text — this is the
 * surface that becomes `speechtext`.
 */
export function expandSpokenForms(input: string): string {
  let text = input.normalize("NFKC");
  text = expandPercents(text);
  text = expandCurrencySymbols(text);
  text = text.replace(/(?<=\d),(?=\d)/g, "");
  text = expandNumbers(text);
  // Collapse any double-spaces introduced by symbol expansion.
  return text.replace(/[ \t]+/g, " ");
}

/**
 * Strip a speechtext-form string into the alignment form: lowercase,
 * punctuation removed, whitespace collapsed. Contractions are preserved
 * (e.g. "don't" stays one token).
 */
export function stripForAlignment(input: string): string {
  let text = input.normalize("NFKC");
  // Strip control (C0/C1) + DEL, then zero-width / BiDi formatting chars.
  // Code-point filtering avoids embedding raw control bytes in a regex literal.
  text = Array.from(text)
    .map((ch) => {
      const c = ch.codePointAt(0) ?? 0;
      if (c <= 0x1f || (c >= 0x7f && c <= 0x9f)) return " ";
      if (c === 0xa0) return " ";
      if (
        (c >= 0x200b && c <= 0x200f) ||
        (c >= 0x202a && c <= 0x202e) ||
        (c >= 0x2060 && c <= 0x2064)
      ) {
        return "";
      }
      return ch;
    })
    .join("");
  // Quote / dash normalisation.
  text = text.replace(/[“”„‟]/g, '"');
  text = text.replace(/[‘’‚‛]/g, "'");
  text = text.replace(/…/g, " ");
  text = text.replace(/[-‐‑⁃–—−]/g, " ");
  // Strip emoji + URLs + emails + handles before the catch-all punctuation pass.
  text = text.replace(/\p{Extended_Pictographic}/gu, " ");
  text = text.replace(/https?:\/\/\S+/gi, " ");
  text = text.replace(/\bwww\.[^\s/]+\b/gi, " ");
  text = text.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi, " ");
  text = text.replace(/@\w+/g, " ");
  // NFKD-then-strip-marks to drop combining diacritics.
  text = text.normalize("NFKD").replace(/\p{M}/gu, "").normalize("NFKC");
  // Strip stray apostrophes that aren't part of a contraction.
  text = text.replace(/(^|[^A-Za-z0-9])'(?=[^A-Za-z0-9]|$)/g, "$1");
  text = text.replace(/(^|[^A-Za-z0-9])'(?=[A-Za-z0-9])/g, "$1");
  // Everything that's not a contraction-letter, digit, or whitespace -> space.
  text = text.replace(/[^A-Za-z0-9'\s]/g, " ");
  text = text.replace(/\s+/g, " ").trim();
  return text.toLowerCase();
}

/**
 * Produce both the speechtext (POSTed to synthesis) and
 * normalisedSpeechtext (POSTed as the alignment transcript) forms from a
 * single plain-text input.
 */
export function buildSpeechtextPair(plainText: string): {
  speechtext: string;
  normalisedSpeechtext: string;
} {
  const speechtext = expandSpokenForms(plainText);
  const normalisedSpeechtext = stripForAlignment(speechtext);
  return { speechtext, normalisedSpeechtext };
}

/**
 * How many alignment tokens a visible string expands to. Used by the
 * rehype plugin to compute `data-n` for each wrapped word / math unit.
 * "$50" -> 2 ("fifty dollar"); "1995" -> 6; unambiguous words -> 1.
 */
export function spokenTokenCount(visible: string): number {
  const normalised = stripForAlignment(expandSpokenForms(visible));
  if (!normalised) return 0;
  return normalised.split(/\s+/).filter(Boolean).length;
}
