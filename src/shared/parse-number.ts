const WORD_TO_INDEX: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
};

const ORDINAL_WORDS = new Set(["first", "second", "third", "fourth", "fifth"]);
const CARDINAL_WORDS = new Set(["one", "two", "three", "four", "five"]);

const SINGLE_WORD_HOMOPHONES: Record<string, number> = {
  won: 1,
  too: 2,
  tree: 3,
  fore: 4,
};

function normalizeTranscript(transcript: string): string[] {
  return transcript
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function digitOrWord(token: string): number | null {
  if (/^[1-5]$/.test(token)) {
    return Number(token);
  }
  return WORD_TO_INDEX[token] ?? null;
}

/**
 * Map a spoken transcript to a 1-based result index.
 * Accepts "3", "three", "number three", "open the first one", etc.
 */
export function parseSpokenIndex(
  transcript: string,
  max = 5,
): number | null {
  const tokens = normalizeTranscript(transcript);
  if (tokens.length === 0) {
    return null;
  }

  const inRange = (value: number | null): number | null =>
    value != null && value >= 1 && value <= max ? value : null;

  const cueWords = new Set(["number", "result", "option", "link", "item"]);
  for (let i = 0; i < tokens.length - 1; i += 1) {
    if (cueWords.has(tokens[i])) {
      const indexed = inRange(digitOrWord(tokens[i + 1]));
      if (indexed) {
        return indexed;
      }
    }
  }

  if (tokens.length === 1) {
    const token = tokens[0];
    return inRange(digitOrWord(token) ?? SINGLE_WORD_HOMOPHONES[token] ?? null);
  }

  for (const token of tokens) {
    if (/^[1-5]$/.test(token)) {
      const indexed = inRange(Number(token));
      if (indexed) {
        return indexed;
      }
    }
  }

  const unique = (words: Set<string>): number | null => {
    const matches = tokens
      .filter((token) => words.has(token))
      .map((token) => WORD_TO_INDEX[token]);
    return matches.length === 1 ? inRange(matches[0]) : null;
  };

  return unique(ORDINAL_WORDS) ?? unique(CARDINAL_WORDS);
}
