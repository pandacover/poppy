const FORMAT_ALIASES: Array<{ test: (value: string) => boolean; format: string }> = [
  { test: (value) => value.includes("webm"), format: "webm" },
  {
    test: (value) => value.includes("wav") || value === "wave" || value.includes("vnd.wave"),
    format: "wav",
  },
  { test: (value) => value.includes("mpeg") || value === "mp3", format: "mp3" },
  { test: (value) => value.includes("mp4") || value === "m4a", format: "m4a" },
  { test: (value) => value.includes("ogg") || value.includes("opus"), format: "ogg" },
  { test: (value) => value.includes("flac"), format: "flac" },
  { test: (value) => value.includes("aac"), format: "aac" },
];

/**
 * Map a MediaRecorder MIME type or raw extension to the short format names
 * OpenRouter's transcription API accepts.
 */
export function normalizeAudioFormat(format: string, fallback = "wav"): string {
  const value = format.toLowerCase().replace(/^audio\//, "").split(";")[0]?.trim() ?? "";
  if (!value) {
    return fallback;
  }
  for (const alias of FORMAT_ALIASES) {
    if (alias.test(value)) {
      return alias.format;
    }
  }
  return value || fallback;
}
