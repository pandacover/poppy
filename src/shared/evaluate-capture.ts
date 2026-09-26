import { CAPTURE_ERROR } from "./capture-errors";

export const MIN_CAPTURE_SECONDS = 0.12;
/** One LSB of 16-bit PCM — digital silence, not merely a quiet room. */
export const SILENCE_PEAK = 1 / 32768;

export type CaptureFailureReason = "empty" | "silent";

export function evaluateCapture(input: {
  sampleCount: number;
  peak: number;
  sampleRate: number;
}): { ok: true } | { ok: false; reason: CaptureFailureReason; message: string } {
  const rate = input.sampleRate > 0 ? input.sampleRate : 16_000;
  const minSamples = Math.max(1, Math.floor(rate * MIN_CAPTURE_SECONDS));
  if (input.sampleCount < minSamples) {
    return { ok: false, reason: "empty", message: CAPTURE_ERROR.emptyAudio };
  }
  if (!(input.peak > SILENCE_PEAK)) {
    return { ok: false, reason: "silent", message: CAPTURE_ERROR.silentMic };
  }
  return { ok: true };
}
