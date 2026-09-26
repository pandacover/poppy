import { arrayBufferToBase64 } from "./base64";

/** Scribe v2 Realtime. */
export const STT_MODEL = "scribe_v2_realtime";

/**
 * ElevenLabs VAD `vad_silence_threshold_secs` minimum is 0.3s (SDK validates
 * 0.3–3.0). 250ms is below that floor, so we use 0.3s on the wire and a local
 * 250ms post-release wait for leftover audio.
 */
export const VAD_SILENCE_THRESHOLD_SECS = 0.3;

/** Local silence / post-release settle before treating the utterance as done. */
export const LOCAL_SILENCE_MS = 250;

/** Coalesce committed transcripts so DuckDuckGo is not scraped twice. */
export const SEARCH_DEBOUNCE_MS = 250;

/**
 * Scribe begins processing after ~2s of audio. Short holds are padded with
 * silence on release so a number like “three” still transcribes.
 */
export const SCRIBE_MIN_AUDIO_MS = 2_000;

/** Extra wait after a manual commit for the committed_transcript event. */
export const COMMIT_GRACE_MS = 400;

export const PCM_SAMPLE_RATES = [8_000, 16_000, 22_050, 24_000, 44_100, 48_000] as const;

export type PcmSampleRate = (typeof PCM_SAMPLE_RATES)[number];

export function nearestPcmSampleRate(sampleRate: number): PcmSampleRate {
  const rate = Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : 16_000;
  let best: PcmSampleRate = 16_000;
  let bestDiff = Infinity;
  for (const candidate of PCM_SAMPLE_RATES) {
    const diff = Math.abs(candidate - rate);
    if (diff < bestDiff) {
      best = candidate;
      bestDiff = diff;
    }
  }
  return best;
}

export function pcmDurationMs(byteLength: number, sampleRate: number): number {
  const rate = sampleRate > 0 ? sampleRate : 16_000;
  return (Math.max(0, byteLength) / 2 / rate) * 1_000;
}

/** Silence padding on release: at least 250ms, and enough to reach Scribe's 2s buffer. */
export function releasePadMs(alreadyMs: number): number {
  const remainingForScribe = Math.max(0, SCRIBE_MIN_AUDIO_MS - Math.max(0, alreadyMs));
  return Math.max(LOCAL_SILENCE_MS, remainingForScribe);
}

export function silencePcm16Base64(sampleRate: number, durationMs: number): string {
  const samples = Math.max(0, Math.round((Math.max(0, sampleRate) * Math.max(0, durationMs)) / 1_000));
  return arrayBufferToBase64(new ArrayBuffer(samples * 2));
}

export function normalizeQuery(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function joinTranscript(committed: readonly string[], partial = ""): string {
  return normalizeQuery([...committed, partial].filter(Boolean).join(" "));
}

export function isNearDuplicateQuery(a: string, b: string): boolean {
  const fold = (value: string) =>
    normalizeQuery(value)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .replace(/\s+/g, " ")
      .trim();
  const left = fold(a);
  const right = fold(b);
  return Boolean(left) && left === right;
}
