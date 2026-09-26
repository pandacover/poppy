function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function coerceText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (Array.isArray(value)) {
    return value.map(coerceText).filter(Boolean).join(" ").trim();
  }
  const rec = asRecord(value);
  if (!rec) {
    return "";
  }
  if (typeof rec.text === "string") {
    return rec.text.trim();
  }
  if (typeof rec.content === "string") {
    return rec.content.trim();
  }
  return "";
}

/**
 * Pull a transcript string out of the shapes OpenRouter and upstream Whisper
 * providers actually return. Empty string means "no speech text found".
 */
export function extractTranscriptText(payload: unknown, depth = 0): string {
  if (depth > 4) {
    return "";
  }
  if (typeof payload === "string") {
    return payload.trim();
  }
  const rec = asRecord(payload);
  if (!rec) {
    return "";
  }

  const direct =
    coerceText(rec.text) ||
    coerceText(rec.transcript) ||
    coerceText(rec.output_text) ||
    coerceText(rec.output);
  if (direct) {
    return direct;
  }

  if (Array.isArray(rec.segments)) {
    const joined = rec.segments
      .map((segment) => coerceText(asRecord(segment)?.text))
      .filter(Boolean)
      .join(" ")
      .trim();
    if (joined) {
      return joined;
    }
  }

  if (Array.isArray(rec.choices) && rec.choices[0]) {
    const choice = asRecord(rec.choices[0]);
    const fromChoice =
      coerceText(choice?.text) ||
      coerceText(asRecord(choice?.message)?.content) ||
      coerceText(asRecord(choice?.delta)?.content);
    if (fromChoice) {
      return fromChoice;
    }
  }

  const nested = asRecord(rec.data);
  if (nested) {
    const inner = extractTranscriptText(nested, depth + 1);
    if (inner) {
      return inner;
    }
  }

  return "";
}

export function extractSttErrorMessage(payload: unknown): string | undefined {
  const rec = asRecord(payload);
  const err = rec?.error;
  if (typeof err === "string" && err.trim()) {
    return err.trim();
  }
  const errObj = asRecord(err);
  if (typeof errObj?.message === "string" && errObj.message.trim()) {
    return errObj.message.trim();
  }
  return undefined;
}

export function responseKeys(payload: unknown): string[] {
  const rec = asRecord(payload);
  return rec ? Object.keys(rec) : [];
}
