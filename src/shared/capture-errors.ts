export const CAPTURE_ERROR = {
  permissionDenied:
    "Microphone permission was denied. Allow the mic for Poppy in system settings and try again.",
  permissionUnavailable:
    "Microphone is unavailable. Check that a mic is connected and not used exclusively by another app.",
  noMicrophone:
    "No microphone was found. Plug one in, or pick an input device in system sound settings.",
  loopbackOnly:
    "Only monitor/loopback inputs were found. In system sound settings, choose your real microphone (not “Monitor of …”) and unmute it.",
  mutedMic:
    "The microphone is muted. Unmute it in OS sound settings (or the hardware mute key) and try again.",
  emptyAudio:
    "No audio was captured. Check the microphone and hold the hotkey a bit longer.",
  silentMic:
    "Microphone is muted or producing silence. Unmute it in OS sound settings, or pick a different input device — not a monitor or loopback.",
  emptyTranscript:
    "Speech-to-text returned an empty transcript. The recording may still be too quiet, or the speech wasn't recognized.",
  timeout: "Speech-to-text timed out. Try a shorter query.",
  network: "Could not reach ElevenLabs. Check your network connection.",
  captureFailed: "Could not start audio capture. Check the microphone and try again.",
} as const;

export function messageForCapturePayload(payload: {
  data?: string;
  error?: "empty" | "silent" | "muted";
}): string | null {
  if (payload.error === "muted") {
    return CAPTURE_ERROR.mutedMic;
  }
  if (payload.error === "silent") {
    return CAPTURE_ERROR.silentMic;
  }
  if (payload.error === "empty" || !payload.data?.trim()) {
    return CAPTURE_ERROR.emptyAudio;
  }
  return null;
}
