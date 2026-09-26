export const CAPTURE_ERROR = {
  emptyAudio:
    "No audio was captured. Check the microphone and hold the hotkey a bit longer.",
  silentMic:
    "Microphone produced silence. In system sound settings, choose the real mic — not a monitor or loopback device — and try again.",
  emptyTranscript:
    "Whisper returned an empty transcript. The recording may still be too quiet, or the speech wasn't recognized.",
  timeout: "Speech-to-text timed out. Try a shorter query.",
  network: "Could not reach OpenRouter. Check your network connection.",
} as const;

export function messageForCapturePayload(payload: {
  data?: string;
  error?: "empty" | "silent";
}): string | null {
  if (payload.error === "silent") {
    return CAPTURE_ERROR.silentMic;
  }
  if (payload.error === "empty" || !payload.data?.trim()) {
    return CAPTURE_ERROR.emptyAudio;
  }
  return null;
}
