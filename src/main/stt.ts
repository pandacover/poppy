import { STT_MODEL } from "../shared/types";

interface TranscriptionResponse {
  text?: string;
  error?: { message?: string; code?: number | string };
}

export async function transcribeAudio(
  apiKey: string,
  audio: { data: string; format: string },
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  let response: Response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/pandacover/poppy",
        "X-OpenRouter-Title": "Poppy",
      },
      body: JSON.stringify({
        model: STT_MODEL,
        input_audio: {
          data: audio.data,
          format: normalizeFormat(audio.format),
        },
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Speech-to-text timed out. Try a shorter query.");
    }
    throw new Error("Could not reach OpenRouter. Check your network connection.");
  } finally {
    clearTimeout(timeout);
  }

  const payload = (await response.json().catch(() => null)) as
    | TranscriptionResponse
    | null;

  if (!response.ok) {
    const message = payload?.error?.message || `Speech-to-text failed (${response.status}).`;
    if (response.status === 401 || response.status === 403) {
      throw new Error("OpenRouter rejected the API key. Check OPENROUTER_API_KEY.");
    }
    throw new Error(message);
  }

  const text = payload?.text?.trim() ?? "";
  if (!text) {
    throw new Error("Didn't catch that. Hold the hotkey and try again.");
  }
  return text;
}

function normalizeFormat(format: string): string {
  const value = format.toLowerCase().replace(/^audio\//, "").split(";")[0];
  if (value.includes("webm")) return "webm";
  if (value.includes("wav")) return "wav";
  if (value.includes("mpeg") || value === "mp3") return "mp3";
  if (value.includes("mp4") || value === "m4a") return "m4a";
  if (value.includes("ogg")) return "ogg";
  if (value.includes("flac")) return "flac";
  if (value.includes("aac")) return "aac";
  return value || "webm";
}
