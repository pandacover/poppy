import { CAPTURE_ERROR } from "./capture-errors";

export const MIN_CAPTURE_SECONDS = 0.12;
/** One LSB of 16-bit PCM — digital silence, not merely a quiet room. */
export const SILENCE_PEAK = 1 / 32768;
/**
 * RMS near zero while holding: OS mute, wrong device, or a monitor source.
 * ~-56 dBFS — well below quiet speech, above true digital zero.
 */
export const MUTE_RMS = 0.0015;
/** Seconds of near-zero RMS while holding before showing a mute warning. */
export const MUTE_HINT_SECONDS = 0.55;

export type CaptureFailureReason = "empty" | "silent" | "muted";

export function evaluateCapture(input: {
  sampleCount: number;
  peak: number;
  rms: number;
  sampleRate: number;
  muted?: boolean;
}): { ok: true } | { ok: false; reason: CaptureFailureReason; message: string } {
  const rate = input.sampleRate > 0 ? input.sampleRate : 16_000;
  const minSamples = Math.max(1, Math.floor(rate * MIN_CAPTURE_SECONDS));
  if (input.sampleCount < minSamples) {
    return { ok: false, reason: "empty", message: CAPTURE_ERROR.emptyAudio };
  }
  if (input.muted) {
    return { ok: false, reason: "muted", message: CAPTURE_ERROR.mutedMic };
  }
  if (!(input.peak > SILENCE_PEAK) || !(input.rms > MUTE_RMS)) {
    return { ok: false, reason: "silent", message: CAPTURE_ERROR.silentMic };
  }
  return { ok: true };
}

export function isNearSilent(rms: number, peak = rms): boolean {
  return !(peak > SILENCE_PEAK) || !(rms > MUTE_RMS);
}
